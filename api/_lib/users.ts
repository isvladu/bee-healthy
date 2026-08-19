/**
 * `app_users` access: email normalization, lookup, and per-account lockout.
 *
 * Lockout is the second layer under the per-IP/per-email rate limits in
 * `rateLimit.ts`. Rate limiting caps request *volume*; lockout caps consecutive
 * *failures* on one account with an escalating delay, so a slow distributed
 * grind that stays under the volume limit still stalls out.
 */
import { serviceClient } from './supabase';

export interface AppUser {
  id: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  failed_attempts: number;
  locked_until: string | null;
}

const USER_COLUMNS =
  'id, email, password_hash, email_verified, failed_attempts, locked_until';

/** Consecutive failures before the account starts locking. */
const LOCK_THRESHOLD = 5;
const BASE_LOCK_MS = 15 * 60 * 1000;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;

/**
 * Lowercase + trim. The column is `citext` so the database enforces this too;
 * doing it here as well keeps the value we *store* canonical rather than
 * merely equivalent.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const { data, error } = await serviceClient()
    .from('app_users')
    .select(USER_COLUMNS)
    .eq('email', normalizeEmail(email))
    .maybeSingle();
  if (error) throw new Error(`user_lookup_failed: ${error.message}`);
  return (data as AppUser | null) ?? null;
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const { data, error } = await serviceClient()
    .from('app_users')
    .select(USER_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`user_lookup_failed: ${error.message}`);
  return (data as AppUser | null) ?? null;
}

/**
 * Insert a new account. Returns null when the email is already taken — the
 * unique index is what decides, so two concurrent signups can't both win.
 */
export async function createUser(
  email: string,
  passwordHash: string,
): Promise<AppUser | null> {
  const { data, error } = await serviceClient()
    .from('app_users')
    .insert({ email: normalizeEmail(email), password_hash: passwordHash })
    .select(USER_COLUMNS)
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation on the email index.
    if (error.code === '23505') return null;
    throw new Error(`user_insert_failed: ${error.message}`);
  }
  return data as AppUser;
}

/**
 * The only user shape that may cross the network. Whitelisted, not omitted —
 * `password_hash` and the lockout counters can never be added by accident.
 */
export function publicUser(user: {
  id: string;
  email: string;
  email_verified: boolean;
}): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified,
  };
}

export function isLocked(user: AppUser): boolean {
  if (!user.locked_until) return false;
  const until = Date.parse(user.locked_until);
  return Number.isFinite(until) && until > Date.now();
}

/** Exponential backoff once past the threshold, capped at a day. */
export function lockDurationMs(failedAttempts: number): number {
  const over = failedAttempts - LOCK_THRESHOLD;
  if (over < 0) return 0;
  return Math.min(BASE_LOCK_MS * 2 ** over, MAX_LOCK_MS);
}

export async function registerFailedLogin(user: AppUser): Promise<void> {
  const failed = user.failed_attempts + 1;
  const lockMs = lockDurationMs(failed);
  await serviceClient()
    .from('app_users')
    .update({
      failed_attempts: failed,
      locked_until:
        lockMs > 0 ? new Date(Date.now() + lockMs).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await serviceClient()
    .from('app_users')
    .update({
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
}

export async function setPasswordHash(
  userId: string,
  passwordHash: string,
): Promise<void> {
  const { error } = await serviceClient()
    .from('app_users')
    .update({
      password_hash: passwordHash,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw new Error(`password_update_failed: ${error.message}`);
}

export async function markEmailVerified(userId: string): Promise<void> {
  const { error } = await serviceClient()
    .from('app_users')
    .update({ email_verified: true, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new Error(`verify_update_failed: ${error.message}`);
}
