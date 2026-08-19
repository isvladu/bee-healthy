/**
 * Rate limiting backed by the `app_login_attempts` table (§5.7 — decided:
 * Supabase, no Redis). Required on auth endpoints, unlike the fire-and-forget
 * telemetry logger: without it, an unauthenticated caller can grind passwords.
 *
 * Every guarded endpoint checks two independent keys — one per IP, one per
 * account — so one attacker cannot lock out every user by hammering a shared
 * address, and cannot dodge the account limit by rotating addresses.
 */
import { serviceClient } from './supabase.js';

export interface LimitRule {
  max: number;
  windowMs: number;
}

/** Tuned to stop grinding while leaving room for an ordinary typo streak. */
export const LOGIN_IP_LIMIT: LimitRule = { max: 30, windowMs: 15 * 60 * 1000 };
export const LOGIN_EMAIL_LIMIT: LimitRule = { max: 10, windowMs: 15 * 60 * 1000 };
export const SIGNUP_IP_LIMIT: LimitRule = { max: 10, windowMs: 60 * 60 * 1000 };
export const RESET_REQUEST_LIMIT: LimitRule = { max: 5, windowMs: 60 * 60 * 1000 };

/** Rows older than this are useless to every rule above. */
const PRUNE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;

export async function countAttempts(
  key: string,
  windowMs: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString();
  // Deliberately NOT `head: true`. A HEAD response carries no body, and
  // postgrest-js turns an empty-bodied 404 into `{ error: null, count: null }`
  // — which a `count ?? 0` would read as "no attempts yet", silently disabling
  // rate limiting for as long as the query was broken. A GET returns a real
  // JSON error body, so failures are visible. `limit(1)` keeps the row payload
  // to nothing; `count: 'exact'` still reports the full total via content-range.
  const { count, error } = await serviceClient()
    .from('app_login_attempts')
    .select('id', { count: 'exact' })
    .eq('key', key)
    .gte('created_at', since)
    .limit(1);
  if (error) throw new Error(`rate_limit_read_failed: ${error.message}`);
  if (count === null) {
    // No count header means we do not know how many attempts there have been.
    // Fail closed: a security control that cannot answer must not answer "fine".
    throw new Error('rate_limit_read_failed: no count returned');
  }
  return count;
}

export async function isRateLimited(
  key: string,
  rule: LimitRule,
): Promise<boolean> {
  return (await countAttempts(key, rule.windowMs)) >= rule.max;
}

/**
 * Record one attempt. Called on failures — and on *successful signups*, which
 * are the expensive-to-us case worth capping regardless of outcome.
 */
export async function recordAttempt(key: string): Promise<void> {
  const { error } = await serviceClient()
    .from('app_login_attempts')
    .insert({ key });
  if (error) throw new Error(`rate_limit_write_failed: ${error.message}`);
  await maybePrune();
}

/** Clear a key's history — called after a genuine successful login. */
export async function clearAttempts(key: string): Promise<void> {
  await serviceClient().from('app_login_attempts').delete().eq('key', key);
}

/**
 * Opportunistic cleanup: roughly one write in twenty also sweeps expired rows,
 * so the table stays bounded without a scheduled job.
 */
async function maybePrune(): Promise<void> {
  if (Math.random() > 0.05) return;
  const cutoff = new Date(Date.now() - PRUNE_OLDER_THAN_MS).toISOString();
  await serviceClient()
    .from('app_login_attempts')
    .delete()
    .lt('created_at', cutoff);
}
