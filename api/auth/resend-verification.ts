/**
 * `POST /api/auth/resend-verification` — issue a fresh confirmation email.
 *
 * Without this, the verification token minted at signup is the only one a user
 * ever gets: lose the email, or have the mail provider misconfigured that day,
 * and the account is stuck unverified with nothing to click.
 *
 * Session-gated, unlike `request-reset`. That is the whole enumeration defense
 * here — the address is read from the session, never from the request, so this
 * can only ever mail the caller's own inbox and there is nothing to probe.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clientIp, guardPost, sendError, sendJson, withErrorHandling } from '../_lib/http.js';
import { issueEmailToken } from '../_lib/emailTokens.js';
import { sendVerificationEmail } from '../_lib/mail.js';
import {
  isRateLimited,
  recordAttempt,
  VERIFY_RESEND_LIMIT,
} from '../_lib/rateLimit.js';
import { requireSession } from '../_lib/session.js';

async function resendVerification(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!guardPost(req, res)) return;

  const session = await requireSession(req, res);
  if (!session) return;

  if (session.emailVerified) {
    // Nothing to do, and no email to burn. Not an error — a second click on a
    // stale banner should be harmless.
    sendJson(res, 200, { ok: true, alreadyVerified: true });
    return;
  }

  const userKey = `verify:user:${session.userId}`;
  const ipKey = `verify:ip:${clientIp(req)}`;
  if (
    (await isRateLimited(userKey, VERIFY_RESEND_LIMIT)) ||
    (await isRateLimited(ipKey, VERIFY_RESEND_LIMIT))
  ) {
    sendError(res, 429, 'rate_limited');
    return;
  }
  await recordAttempt(userKey);
  await recordAttempt(ipKey);

  // Issuing a new token retires any earlier unused one, so an older link in the
  // inbox stops working the moment a fresh one is sent.
  const token = await issueEmailToken(session.userId, 'verify');
  const mailed = await sendVerificationEmail(session.email, token);

  // Report the send outcome so the UI can distinguish "check your inbox" from
  // "this deployment has no mail provider configured".
  sendJson(res, 200, { ok: true, alreadyVerified: false, email: mailed });
}

export default withErrorHandling(resendVerification);
