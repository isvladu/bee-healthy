/**
 * Session lifecycle: an opaque token in an httpOnly cookie, backed by a row in
 * `app_sessions`.
 *
 * Chosen over a stateless JWT (§5.4) for two reasons: revocation is instant
 * (delete the row) and no signing secret ever has to be trusted to the browser.
 * `httpOnly` also means JavaScript cannot read the token at all, removing the
 * XSS token-theft vector that the old `localStorage` Supabase JWT had.
 *
 * Rotation note: we implement *sliding expiry* plus rotation at the moments
 * that matter (every login mints a new session; a password reset revokes all of
 * them). Periodic mid-session rotation is deliberately not implemented — an
 * offline-first PWA fires overlapping requests, and two of them racing a
 * rotating token would sign the user out for no security gain.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isSecureRequest, sendError } from './http';
import { serviceClient } from './supabase';
import { hashToken, randomToken } from './tokens';

export const SESSION_COOKIE = 'bh_session';

/** Full session lifetime, and the point at which we slide it forward. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_WHEN_REMAINING_MS = 15 * 24 * 60 * 60 * 1000;

function serializeCookie(
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    // Lax (not Strict) so following a link into the app keeps the user signed
    // in; combined with the Origin check on every POST this covers CSRF.
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function setSessionCookie(
  req: VercelRequest,
  res: VercelResponse,
  token: string,
): void {
  res.setHeader(
    'set-cookie',
    serializeCookie(token, SESSION_TTL_MS / 1000, isSecureRequest(req)),
  );
}

export function clearSessionCookie(
  req: VercelRequest,
  res: VercelResponse,
): void {
  res.setHeader('set-cookie', serializeCookie('', 0, isSecureRequest(req)));
}

/** Read the raw token from the request, whether or not Vercel parsed cookies. */
export function readSessionToken(req: VercelRequest): string | null {
  const parsed = req.cookies?.[SESSION_COOKIE];
  if (parsed) return parsed;

  const header = req.headers.cookie;
  if (!header) return null;
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    if (pair.slice(0, index).trim() === SESSION_COOKIE) {
      return decodeURIComponent(pair.slice(index + 1).trim()) || null;
    }
  }
  return null;
}

/** Mint a session row and return the raw token (the only time it exists). */
export async function createSession(
  userId: string,
  userAgent: string | undefined,
): Promise<string> {
  const token = randomToken();
  const { error } = await serviceClient()
    .from('app_sessions')
    .insert({
      user_id: userId,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      user_agent: userAgent?.slice(0, 300) ?? null,
    });
  if (error) throw new Error(`session_insert_failed: ${error.message}`);
  return token;
}

export interface ResolvedSession {
  userId: string;
  sessionId: string;
  emailVerified: boolean;
  email: string;
}

/**
 * Resolve the cookie to a live session, sliding its expiry when it is over
 * halfway through its life. Returns null for absent, unknown, revoked, or
 * expired tokens — all indistinguishable to the caller.
 */
export async function resolveSession(
  req: VercelRequest,
): Promise<ResolvedSession | null> {
  const token = readSessionToken(req);
  if (!token) return null;

  const client = serviceClient();
  const { data, error } = await client
    .from('app_sessions')
    .select('id, user_id, expires_at, revoked_at, app_users!inner(email, email_verified)')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (error) throw new Error(`session_lookup_failed: ${error.message}`);
  if (!data || data.revoked_at) return null;

  const expiresAt = Date.parse(data.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  if (expiresAt - Date.now() < RENEW_WHEN_REMAINING_MS) {
    await client
      .from('app_sessions')
      .update({ expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString() })
      .eq('id', data.id);
  }

  // The embedded join arrives as an object (`!inner` on a to-one relation), but
  // supabase-js types it loosely; normalize before reading.
  const user = (
    Array.isArray(data.app_users) ? data.app_users[0] : data.app_users
  ) as { email: string; email_verified: boolean } | undefined;

  return {
    userId: data.user_id,
    sessionId: data.id,
    email: user?.email ?? '',
    emailVerified: Boolean(user?.email_verified),
  };
}

/**
 * Resolve the session or answer 401. Refreshes the cookie so the sliding
 * expiry the database just granted is reflected in the browser.
 */
export async function requireSession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<ResolvedSession | null> {
  const session = await resolveSession(req);
  if (!session) {
    sendError(res, 401, 'unauthenticated');
    return null;
  }
  return session;
}

/** Revoke one session (logout). Idempotent. */
export async function revokeSession(sessionId: string): Promise<void> {
  await serviceClient()
    .from('app_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId);
}

/** Revoke every session for a user — used after a password reset. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await serviceClient()
    .from('app_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null);
}
