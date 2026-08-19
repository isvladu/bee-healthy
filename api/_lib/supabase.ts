/**
 * The service-role Supabase client — the only database handle in the project.
 *
 * The service role BYPASSES Row-Level Security. That is deliberate (§5.1
 * Option A: the backend is the only thing that talks to Postgres), and it is
 * also why nothing outside `api/` may import this module, and why every query
 * must go through the user-scoped helpers in `data.ts` rather than calling
 * `client.from('records')` directly.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { backendEnv } from './env';

let cached: SupabaseClient | null = null;
let cachedFor = '';

export function serviceClient(): SupabaseClient {
  const { supabaseUrl, serviceRoleKey } = backendEnv();
  // Re-create if the environment changed under us (tests do this).
  if (!cached || cachedFor !== supabaseUrl + serviceRoleKey) {
    cached = createClient(supabaseUrl, serviceRoleKey, {
      // A serverless function has no user session to persist or refresh, and
      // persisting one would be a cross-request leak.
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cachedFor = supabaseUrl + serviceRoleKey;
  }
  return cached;
}

/** Test seam — drops the memoized client. */
export function resetServiceClient(): void {
  cached = null;
  cachedFor = '';
}
