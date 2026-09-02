'use client';

import { createBrowserClient } from '@supabase/ssr';

const clean = (val?: string) => val?.replace(/^["']|["']$/g, '').trim();

let cached: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Are the public Supabase credentials present in this bundle?
 *
 * `NEXT_PUBLIC_*` values are inlined by the compiler at **build** time, not
 * read at runtime. A Docker image built without them therefore ships a browser
 * bundle containing `undefined` — and `--env-file` at `docker run` cannot fix
 * it, because there is no longer anything to substitute. The symptom is that
 * "Continue with Google" does nothing at all, while every server route keeps
 * working, so the config looks fine.
 *
 * The Dockerfile now takes these as build args for exactly this reason. This
 * check exists so the failure states its own cause instead of surfacing as an
 * opaque error from inside the Supabase SDK.
 */
export function supabaseConfigured(): boolean {
  return Boolean(
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL) && clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

/** Browser Supabase client. All reads go through RLS as the signed-in user. */
export function supabaseBrowser() {
  if (!cached) {
    const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const anonKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    if (!url || !anonKey) {
      throw new Error(
        'Supabase browser credentials are missing from this build. ' +
          'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are inlined at build time, ' +
          'so they must be passed as Docker build args (see Dockerfile), not only at run time.',
      );
    }

    cached = createBrowserClient(url, anonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return cached;
}
