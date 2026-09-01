'use client';

import { createBrowserClient } from '@supabase/ssr';

const clean = (val?: string) => val?.replace(/^["']|["']$/g, '').trim();

let cached: ReturnType<typeof createBrowserClient> | null = null;

/** Browser Supabase client. All reads go through RLS as the signed-in user. */
export function supabaseBrowser() {
  if (!cached) {
    cached = createBrowserClient(
      clean(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
      clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    );
  }
  return cached;
}
