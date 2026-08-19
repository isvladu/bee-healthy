/**
 * Single-use, short-lived tokens for email verification and password reset
 * (§5.11). Only the HMAC of each token is stored, so this table is not a set of
 * usable reset links even if it leaks.
 */
import { serviceClient } from './supabase';
import { hashToken, randomToken } from './tokens';

export type EmailTokenType = 'verify' | 'reset';

/** A reset link is the more dangerous artifact, so it lives a much shorter life. */
const TTL_MS: Record<EmailTokenType, number> = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

/**
 * Issue a token, invalidating any earlier unused token of the same type for
 * that user — requesting a new reset link must retire the previous one, or a
 * link sitting in an old email stays live for its full hour.
 */
export async function issueEmailToken(
  userId: string,
  type: EmailTokenType,
): Promise<string> {
  const client = serviceClient();
  const now = new Date().toISOString();

  await client
    .from('app_email_tokens')
    .update({ used_at: now })
    .eq('user_id', userId)
    .eq('type', type)
    .is('used_at', null);

  const token = randomToken();
  const { error } = await client.from('app_email_tokens').insert({
    user_id: userId,
    type,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + TTL_MS[type]).toISOString(),
  });
  if (error) throw new Error(`email_token_insert_failed: ${error.message}`);
  return token;
}

/**
 * Redeem a token exactly once. The `is('used_at', null)` guard on the UPDATE is
 * what makes this safe under concurrency: two simultaneous requests with the
 * same token both pass the SELECT, but only one UPDATE matches a row, and the
 * other gets nothing back and fails.
 *
 * Returns the owning user id, or null for unknown, expired, or already-used
 * tokens — the caller cannot tell those apart.
 */
export async function consumeEmailToken(
  token: string,
  type: EmailTokenType,
): Promise<string | null> {
  if (!token) return null;
  const client = serviceClient();

  const { data, error } = await client
    .from('app_email_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', hashToken(token))
    .eq('type', type)
    .maybeSingle();
  if (error) throw new Error(`email_token_lookup_failed: ${error.message}`);
  if (!data || data.used_at) return null;

  const expiresAt = Date.parse(data.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const { data: claimed, error: claimError } = await client
    .from('app_email_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', data.id)
    .is('used_at', null)
    .select('user_id')
    .maybeSingle();
  if (claimError) {
    throw new Error(`email_token_claim_failed: ${claimError.message}`);
  }
  return claimed ? (claimed.user_id as string) : null;
}
