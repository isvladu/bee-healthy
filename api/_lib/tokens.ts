/**
 * Opaque token primitives, shared by sessions and email links.
 *
 * The rule both callers follow: generate 256 bits of CSPRNG randomness, hand
 * the raw token to exactly one recipient (a cookie, an email link), and store
 * only `hashToken()` of it. A dump of `app_sessions` or `app_email_tokens`
 * therefore contains nothing replayable.
 *
 * Hashing is HMAC-SHA-256 keyed with `SESSION_SECRET` rather than a bare
 * digest, so an attacker holding the table still can't test candidate tokens
 * offline without also holding the server secret. Rotating that secret
 * invalidates every session and pending email link — a sign-out for everyone,
 * not a lockout, which is why peppering is safe here and not for passwords.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { backendEnv } from './env';

/** 32 bytes = 256 bits, per §5.4. */
const TOKEN_BYTES = 32;

export function randomToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHmac('sha256', backendEnv().sessionSecret)
    .update(token)
    .digest('hex');
}

/** Constant-time comparison of two hex digests of equal length. */
export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
