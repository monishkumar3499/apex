import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPath, isAssetPath, safeNext } from './lib/auth-url';

type CookieWrite = { name: string; value: string; options?: CookieOptions };

const clean = (val?: string) => val?.replace(/^["']|["']$/g, '').trim();

/**
 * Refreshes the Supabase session cookie on every request and gates the app
 * routes. Without this, server components see an expired token and every
 * protected page flashes a redirect.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never spend a Supabase round trip on an asset.
  if (isAssetPath(pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });

  if (clean(process.env.NEXT_PUBLIC_DEMO_MODE) === 'true') return response;

  const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // Misconfigured rather than unauthenticated. Redirecting to /login here
  // would produce a loop, since /login cannot work either.
  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: CookieWrite[]) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Supabase unreachable. Treat as signed out for gating, but let a public
    // page render rather than failing the whole request.
    user = null;
  }

  if (!user && !isPublicPath(pathname)) {
    // An API caller wants a status code it can branch on, not 307 to a page of
    // HTML. `fetch(...).json()` on a login page is the "Unexpected token <"
    // error that makes an expired session look like a broken feature.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'Sign in to continue' }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    // Preserve the query string, so a deep link with filters survives sign-in.
    url.searchParams.set('next', safeNext(`${pathname}${request.nextUrl.search}`, '/app'));
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    // `safeNext` can carry a query string, so build the URL rather than
    // assigning to `pathname` — that would percent-encode the "?".
    const target = safeNext(request.nextUrl.searchParams.get('next'), '/app');
    return NextResponse.redirect(new URL(target, request.nextUrl.origin));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
