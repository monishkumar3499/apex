import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieWrite = { name: string; value: string; options?: CookieOptions };

const PUBLIC_PREFIXES = ['/', '/login', '/auth', '/api/health'];
const isPublic = (path: string) =>
  PUBLIC_PREFIXES.some((p) => (p === '/' ? path === '/' : path.startsWith(p)));

/**
 * Refreshes the Supabase session cookie on every request and gates the app
 * routes. Without this, server components see an expired token and every
 * protected page flashes a redirect.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: CookieWrite[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  if (!data.user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (data.user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
