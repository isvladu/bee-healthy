/**
 * `POST /api/sync/push` — upload locally-pending records.
 *
 * The browser used to write to Supabase directly with an anon key, and RLS
 * decided what it could touch. Now the browser sends records here and the
 * server writes them with the service-role key, scoped to the session user by
 * `userScope` — the client no longer holds any database credential at all.
 *
 * Note what this handler does NOT read: there is no user id anywhere in the
 * request. It comes from the session cookie or the request is rejected.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { guardPost, sendJson, withErrorHandling } from '../_lib/http.js';
import { userScope } from '../_lib/data.js';
import { issuePaths, syncPushSchema } from '../_lib/schemas.js';
import { requireSession } from '../_lib/session.js';

async function push(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardPost(req, res)) return;

  const session = await requireSession(req, res);
  if (!session) return;

  const parsed = syncPushSchema.safeParse(req.body);
  if (!parsed.success) {
    sendJson(res, 400, {
      error: 'invalid_input',
      fields: issuePaths(parsed.error),
    });
    return;
  }

  const pushed = await userScope(session.userId).upsertRecords(
    parsed.data.records,
  );
  sendJson(res, 200, { pushed });
}

export default withErrorHandling(push);
