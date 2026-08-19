/**
 * `POST /api/auth/signup` — create an account and sign it in.
 *
 * Unlike the reset flow, this endpoint DOES reveal that an email is already
 * registered (409). That is an accepted trade: a signup form cannot silently
 * pretend to have created an account that already exists without stranding the
 * real user, and the same fact is discoverable by trying to sign up anyway.
 * The enumeration-resistant paths are login and reset, where it matters.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clientIp, guardPost, sendError, sendJson, withErrorHandling } from '../_lib/http.js';
import { hashPassword } from '../_lib/password.js';
import { isRateLimited, recordAttempt, SIGNUP_IP_LIMIT } from '../_lib/rateLimit.js';
import { credentialsSchema, issuePaths } from '../_lib/schemas.js';
import { createSession, setSessionCookie } from '../_lib/session.js';
import { createUser, publicUser } from '../_lib/users.js';
import { issueEmailToken } from '../_lib/emailTokens.js';
import { sendVerificationEmail } from '../_lib/mail.js';

async function signup(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardPost(req, res)) return;

  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    // Paths only — an error message would echo the submitted password back.
    sendJson(res, 400, {
      error: 'invalid_input',
      fields: issuePaths(parsed.error),
    });
    return;
  }
  const { email, password } = parsed.data;

  const ipKey = `signup:ip:${clientIp(req)}`;
  if (await isRateLimited(ipKey, SIGNUP_IP_LIMIT)) {
    sendError(res, 429, 'rate_limited');
    return;
  }
  // Counted whether or not the signup succeeds: each attempt costs us a scrypt
  // hash, so volume is what we are capping, not failure.
  await recordAttempt(ipKey);

  const user = await createUser(email, await hashPassword(password));
  if (!user) {
    sendError(res, 409, 'email_taken');
    return;
  }

  // Best-effort: an unreachable mail provider must not fail the signup. The
  // account simply stays unverified and the user can request a new link.
  const token = await issueEmailToken(user.id, 'verify');
  const mailed = await sendVerificationEmail(user.email, token);

  const sessionToken = await createSession(user.id, req.headers['user-agent']);
  setSessionCookie(req, res, sessionToken);
  sendJson(res, 201, { user: publicUser(user), verificationEmail: mailed });
}

export default withErrorHandling(signup);
