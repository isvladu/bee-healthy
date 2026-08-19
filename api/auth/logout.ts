/**
 * `POST /api/auth/logout` — revoke the current session.
 *
 * Always answers 200 and always clears the cookie, even when the session was
 * already gone: "sign me out" has one correct outcome, and reporting 401 here
 * would only tell a caller which cookies are live.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { guardPost, sendJson, withErrorHandling } from '../_lib/http.js';
import { clearSessionCookie, resolveSession, revokeSession } from '../_lib/session.js';

async function logout(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardPost(req, res)) return;

  const session = await resolveSession(req);
  if (session) await revokeSession(session.sessionId);

  clearSessionCookie(req, res);
  sendJson(res, 200, { ok: true });
}

export default withErrorHandling(logout);
