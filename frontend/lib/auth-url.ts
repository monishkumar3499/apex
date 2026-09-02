/**
 * URL rules for the auth flow.
 *
 * These are pure functions on purpose. Redirect handling is the part of an
 * auth flow that is quietly exploitable when it is subtly wrong, so it is
 * covered by unit tests (`auth-url.test.ts`) rather than by clicking through
 * a browser and hoping.
 */

/** Paths that never require a session. */
const PUBLIC_PATHS = ['/login', '/auth', '/api/health'];

/**
 * Is this path reachable without signing in?
 *
 * Matched on a path *boundary*: a bare `startsWith('/login')` also matches
 * `/login-as-admin`, which is exactly the kind of accidental hole that makes
 * a gate useless.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Static assets and Next internals — never gated, never redirected. */
export function isAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/manifest.webmanifest' ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|avif|txt|xml|woff2?)$/i.test(pathname)
  );
}

/**
 * Reduce a `next=` parameter to a safe same-origin path.
 *
 * `startsWith('/')` is NOT sufficient. `//evil.com` is a protocol-relative
 * URL and a browser follows it straight off-site; `/\evil.com` is normalised
 * to the same thing by several engines. Anything that is not a single-slash
 * absolute path is discarded rather than repaired.
 */
export function safeNext(next: string | null | undefined, fallback = '/app'): string {
  if (!next) return fallback;

  const value = next.trim();
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // Control characters (a bare CR/LF included) can smuggle a second header.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  // "/javascript:..." and friends — never a route in this app.
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(value)) return fallback;

  return value;
}

/**
 * The origin the *browser* used, which is not the one the container sees.
 *
 * Behind the reverse proxy on EC2 the request arrives as plain HTTP on an
 * internal host, so `new URL(request.url).origin` resolves to
 * `http://localhost:3000`. Every OAuth redirect then either lands on the
 * wrong host or downgrades an HTTPS session to HTTP — and a `Secure` auth
 * cookie set on that response is silently dropped. That is a sign-in that
 * "does nothing", with no error surfaced anywhere.
 *
 * `APP_ORIGIN` wins when set, because a forwarded header is client-supplied
 * and a spoofed one turns this into a phishing hop. Set it in production.
 */
export function resolveOrigin(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = normaliseOrigin(env.APP_ORIGIN);
  if (configured) return configured;

  const headers = request.headers;
  const forwardedHost = firstHeaderValue(headers.get('x-forwarded-host')) || headers.get('host');
  const forwardedProto = firstHeaderValue(headers.get('x-forwarded-proto'));

  if (forwardedHost) {
    const local = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(forwardedHost);
    const proto = forwardedProto || (local ? 'http' : 'https');
    const candidate = normaliseOrigin(`${proto}://${forwardedHost}`);
    if (candidate) return candidate;
  }

  return new URL(request.url).origin;
}

/** `x-forwarded-*` accumulates a comma-separated chain; the client is first. */
function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

function normaliseOrigin(value: string | undefined): string | null {
  const raw = value?.replace(/^["']|["']$/g, '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Turn whatever the provider handed back into something a learner can act on.
 *
 * Supabase and Google both return machine codes; showing `server_error` to a
 * person is the same as showing nothing.
 */
export function describeAuthError(code: string | null, description: string | null): string {
  const readable = description?.replace(/\+/g, ' ').trim();

  switch (code) {
    case 'access_denied':
      return 'Sign-in was cancelled before the provider confirmed it.';
    case 'otp_expired':
      return 'That sign-in link has expired. Request a fresh one.';
    case 'invalid_request':
      return 'That sign-in link is incomplete. Request a fresh one.';
    case 'server_error':
      return readable || 'The sign-in provider had a problem. Try again in a moment.';
    default:
      return readable || code || 'Sign-in could not be completed.';
  }
}
