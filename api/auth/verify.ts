/**
 * `POST /api/auth/verify` — redeem an email-verification token.
 *
 * The token is the credential, so no session is required: a user who clicks the
 * link on a different device than they signed up on still gets verified.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { guardPost, sendError, sendJson, withErrorHandling } from '../_lib/http.js';
import { consumeEmailToken } from '../_lib/emailTokens.js';
import { issuePaths, verifySchema } from '../_lib/schemas.js';
import { markEmailVerified } from '../_lib/users.js';

async function verify(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardPost(req, res)) return;

  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    sendJson(res, 400, {
      error: 'invalid_input',
      fields: issuePaths(parsed.error),
    });
    return;
  }

  const userId = await consumeEmailToken(parsed.data.token, 'verify');
  if (!userId) {
    // Unknown, expired, and already-used tokens are one answer on purpose.
    sendError(res, 400, 'invalid_token');
    return;
  }

  await markEmailVerified(userId);
  sendJson(res, 200, { ok: true });
}

export default withErrorHandling(verify);
