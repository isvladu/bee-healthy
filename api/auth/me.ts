/**
 * `GET /api/auth/me` — the client's session hydration point, replacing
 * Supabase's `onAuthStateChange`. 401 means "signed out", which the client
 * treats as a normal state, not an error.
 *
 * No Origin check: this is a read-only GET, and same-origin GETs don't send an
 * `Origin` header at all. `SameSite=Lax` keeps the cookie off cross-site
 * subresource requests, and a cross-site reader could not see the response body
 * regardless.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { guardGet, sendJson, withErrorHandling } from '../_lib/http';
import { requireSession } from '../_lib/session';

async function me(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardGet(req, res)) return;

  const session = await requireSession(req, res);
  if (!session) return;

  sendJson(res, 200, {
    user: {
      id: session.userId,
      email: session.email,
      emailVerified: session.emailVerified,
    },
  });
}

export default withErrorHandling(me);
