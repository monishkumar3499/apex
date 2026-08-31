import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabase/server';

export const runtime = 'nodejs';

/** Exchanges the OAuth / magic-link code for a session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/app';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  // Only ever redirect to a same-origin path.
  const target = next.startsWith('/') ? next : '/app';
  return NextResponse.redirect(new URL(target, url.origin));
}
