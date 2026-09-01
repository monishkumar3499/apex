import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieWrite = { name: string; value: string; options?: CookieOptions };

const clean = (val?: string) => val?.replace(/^["']|["']$/g, '').trim();

/**
 * Server-side Supabase client bound to the request's auth cookies.
 * Use in server components and route handlers to identify the caller.
 */
export async function supabaseServer() {
  const store = await cookies();

  return createServerClient(
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: CookieWrite[]) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a server component — middleware already refreshed the session.
          }
        },
      },
    },
  );
}

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

/** Resolve the signed-in user, or null. Honours DEMO_MODE for local runs. */
export async function currentUser(): Promise<SessionUser | null> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return { id: DEMO_USER_ID, email: 'demo@apex.app', name: 'Demo Learner', avatarUrl: null };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const meta = data.user.user_metadata ?? {};
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    name: meta.full_name ?? meta.name ?? data.user.email?.split('@')[0] ?? null,
    avatarUrl: meta.avatar_url ?? null,
  };
}

/** Fixed UUID used when DEMO_MODE bypasses auth. Must exist in auth.users. */
export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';
