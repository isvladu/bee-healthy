/**
 * `POST /api/auth/reset` — set a new password from a reset token.
 *
 * Revoking every session afterwards is the point of the flow, not a nicety: a
 * reset is what a user does when they believe someone else has their password,
 * and leaving that someone's session alive would make the reset cosmetic. The
 * user signs in again with the new password.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { guardPost, sendError, sendJson, withErrorHandling } from '../_lib/http';
import { consumeEmailToken } from '../_lib/emailTokens';
import { hashPassword } from '../_lib/password';
import { issuePaths, resetSchema } from '../_lib/schemas';
import { clearSessionCookie, revokeAllSessions } from '../_lib/session';
import { setPasswordHash } from '../_lib/users';

async function reset(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardPost(req, res)) return;

  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    sendJson(res, 400, {
      error: 'invalid_input',
      fields: issuePaths(parsed.error),
    });
    return;
  }

  const userId = await consumeEmailToken(parsed.data.token, 'reset');
  if (!userId) {
    sendError(res, 400, 'invalid_token');
    return;
  }

  await setPasswordHash(userId, await hashPassword(parsed.data.password));
  await revokeAllSessions(userId);
  clearSessionCookie(req, res);

  sendJson(res, 200, { ok: true });
}

export default withErrorHandling(reset);
