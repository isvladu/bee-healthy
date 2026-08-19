/**
 * `POST /api/auth/request-reset` — start a password reset.
 *
 * ALWAYS answers 200, whether or not the address belongs to an account (§5.11).
 * A 404 here would turn this endpoint into a free membership oracle, so the
 * response is identical either way and the difference exists only in whether an
 * email goes out.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clientIp, guardPost, sendJson, withErrorHandling } from '../_lib/http.js';
import { issueEmailToken } from '../_lib/emailTokens.js';
import { sendPasswordResetEmail } from '../_lib/mail.js';
import { isRateLimited, recordAttempt, RESET_REQUEST_LIMIT } from '../_lib/rateLimit.js';
import { emailOnlySchema } from '../_lib/schemas.js';
import { findUserByEmail } from '../_lib/users.js';

async function requestReset(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!guardPost(req, res)) return;

  const parsed = emailOnlySchema.safeParse(req.body);
  // Even a malformed body gets the standard answer — reporting field errors
  // here would distinguish "not an email" from "no such account".
  if (!parsed.success) {
    sendJson(res, 200, { ok: true });
    return;
  }
  const { email } = parsed.data;

  const ipKey = `reset:ip:${clientIp(req)}`;
  const emailKey = `reset:email:${email}`;
  const limited =
    (await isRateLimited(ipKey, RESET_REQUEST_LIMIT)) ||
    (await isRateLimited(emailKey, RESET_REQUEST_LIMIT));

  if (!limited) {
    await recordAttempt(ipKey);
    await recordAttempt(emailKey);

    const user = await findUserByEmail(email);
    if (user) {
      const token = await issueEmailToken(user.id, 'reset');
      await sendPasswordResetEmail(user.email, token);
    }
  }

  // Same body in every branch, including "rate limited" — a 429 would leak
  // that someone has been requesting resets for this address.
  sendJson(res, 200, { ok: true });
}

export default withErrorHandling(requestReset);
