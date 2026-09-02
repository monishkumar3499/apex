import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseServer } from '../../../lib/supabase/server';
import { resolveOrigin, safeNext, describeAuthError } from '../../../lib/auth-url';
import { logger } from '../../../../backend/logger/pino';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OTP_TYPES = new Set<EmailOtpType>(['magiclink', 'signup', 'invite', 'recovery', 'email_change', 'email']);

/**
 * The single landing point for every sign-in.
 *
 * Three shapes arrive here and all three must work, because which one you get
 * depends on provider and on Supabase project settings rather than on anything
 * this app controls:
 *
 *   1. `?code=…`                  PKCE — Google OAuth, and magic links on a
 *                                 project with the PKCE flow enabled.
 *   2. `?token_hash=…&type=…`     the newer email-link shape.
 *   3. `?error=…`                 the provider refused or the learner
 *                                 cancelled. This is a normal outcome, not an
 *                                 exception, and it has to be *shown*.
 *
 * Redirects are built on the origin the browser actually used, not on
 * `request.url` — behind the reverse proxy those differ, and the difference is
 * a sign-in that silently loops back to the login page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = resolveOrigin(request);
  const next = safeNext(url.searchParams.get('next'));

  const bounce = (error: string, extra?: Record<string, string>) => {
    const target = new URL('/login', origin);
    target.searchParams.set('error', error);
    if (next !== '/app') target.searchParams.set('next', next);
    Object.entries(extra ?? {}).forEach(([k, v]) => target.searchParams.set(k, v));
    return NextResponse.redirect(target);
  };

  // ---- 3. the provider said no --------------------------------------------
  const providerError = url.searchParams.get('error') || url.searchParams.get('error_code');
  if (providerError) {
    const message = describeAuthError(providerError, url.searchParams.get('error_description'));
    logger.warn({ providerError, message }, 'auth.callback.provider-error');
    return bounce(message);
  }

  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const otpType = url.searchParams.get('type') as EmailOtpType | null;

  if (!code && !tokenHash) {
    // Usually a link opened twice, or a bare visit to /auth/callback.
    return bounce('That sign-in link has already been used. Request a fresh one.');
  }

  const supabase = await supabaseServer();

  try {
    if (code) {
      // ---- 1. PKCE ------------------------------------------------------
      // Needs the code-verifier cookie the browser client set when the flow
      // started. If the learner began sign-in on a different browser (or the
      // link opened inside an in-app webview), that cookie is absent and the
      // exchange fails — hence the explicit message rather than a raw error.
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        logger.warn({ error: error.message }, 'auth.callback.exchange-failed');
        return bounce(
          /verifier|pkce/i.test(error.message)
            ? 'Open the sign-in link in the same browser you requested it from.'
            : describeAuthError(null, error.message),
        );
      }
    } else if (tokenHash && otpType && OTP_TYPES.has(otpType)) {
      // ---- 2. email token hash -------------------------------------------
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
      if (error) {
        logger.warn({ error: error.message, otpType }, 'auth.callback.verify-failed');
        return bounce(describeAuthError(null, error.message));
      }
    } else {
      return bounce('That sign-in link is malformed. Request a fresh one.');
    }
  } catch (error) {
    // A thrown exchange means Supabase was unreachable, not that the learner
    // did anything wrong. Never leave them on a blank screen for it.
    logger.error({ error }, 'auth.callback.threw');
    return bounce('We could not reach the sign-in service. Try again in a moment.');
  }

  // Confirm the cookie actually took. Without this a misconfigured cookie
  // domain sends the learner to /app, where middleware bounces them straight
  // back to /login — an infinite loop with no visible cause.
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) {
    logger.error({ error: userError?.message }, 'auth.callback.session-not-persisted');
    return bounce('Your session could not be saved. Check that cookies are enabled and try again.');
  }

  logger.info({ userId: data.user.id, next }, 'auth.callback.ok');
  return NextResponse.redirect(new URL(next, origin));
}
