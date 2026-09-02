import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabase/server';
import { resolveOrigin } from '../../../lib/auth-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-side sign-out.
 *
 * The browser client can clear its own cookies, but only the ones it can see
 * from JavaScript. Doing it here removes the httpOnly refresh cookie too, so
 * "sign out" cannot leave a session that the *server* still considers valid —
 * which looks to the learner like signing out did nothing.
 */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', resolveOrigin(request)), { status: 303 });
}

/** GET so a plain link works too (e.g. when JS has failed to load). */
export const GET = POST;
