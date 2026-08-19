/**
 * `GET /api/sync/pull?since=<iso>` — records changed since the client's
 * watermark, oldest first.
 *
 * Returns `complete: false` when the page filled up, so the client knows its
 * watermark advanced over a truncated result and can pull again instead of
 * silently losing the tail (the failure mode the old direct-to-Supabase path
 * could only warn about after the fact).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { guardGet, sendError, sendJson, withErrorHandling } from '../_lib/http.js';
import { userScope } from '../_lib/data.js';
import { requireSession } from '../_lib/session.js';

const EPOCH = '1970-01-01T00:00:00.000Z';
const PAGE_LIMIT = 500;

async function pull(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardGet(req, res)) return;

  const session = await requireSession(req, res);
  if (!session) return;

  const raw = req.query.since;
  const since = typeof raw === 'string' && raw ? raw : EPOCH;
  if (!Number.isFinite(Date.parse(since))) {
    sendError(res, 400, 'invalid_since');
    return;
  }

  const rows = await userScope(session.userId).listRecordsSince(
    since,
    PAGE_LIMIT,
  );

  sendJson(res, 200, {
    records: rows.map((row) => ({
      id: row.id,
      type: row.type,
      updatedAt: row.updated_at,
      deleted: row.deleted,
      data: row.data,
    })),
    complete: rows.length < PAGE_LIMIT,
  });
}

export default withErrorHandling(pull);
