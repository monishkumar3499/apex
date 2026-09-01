import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger/pino';

/**
 * Service-role client used by the build pipeline and API route handlers.
 *
 * It bypasses RLS, so **every** query written against it must filter by
 * user_id explicitly. Never import this into client components.
 */
const clean = (val?: string) => val?.replace(/^["']|["']$/g, '').trim();

let cached: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (cached) return cached;

  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !key) {
    logger.error('Supabase service credentials are missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
    throw new Error('Supabase service credentials are not configured');
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-apex-role': 'service' } },
  });

  return cached;
}

/**
 * Throw on a Supabase error, with the operation name attached for triage.
 * Narrows away the `| null` on `data` so callers don't have to guard twice.
 */
export function must<T>(
  result: {
    data: T;
    error: { message: string; details?: string | null; hint?: string | null; code?: string | null } | null;
  },
  op: string,
): NonNullable<T> {
  if (result.error) {
    const { message, details, hint, code } = result.error;
    // A transport failure arrives as a bare "TypeError: fetch failed" with the
    // real cause only in `details`. Logging just `message` made those
    // undiagnosable, so carry everything the client gives us.
    logger.error({ op, error: message, details, hint, code }, 'supabase.error');
    throw new Error(`${op}: ${message}${code ? ` [${code}]` : ''}${details ? ` — ${details}` : ''}`);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`${op}: no rows returned`);
  }
  return result.data as NonNullable<T>;
}

export default admin;
