/**
 * `POST /api/auth/login` — verify a password and mint a session.
 *
 * Three defenses stack here:
 *  - per-IP and per-account rate limits cap request volume (`rateLimit.ts`);
 *  - per-account lockout with escalating backoff caps consecutive failures
 *    (`users.ts`), catching a slow grind that stays under the volume limit;
 *  - every failure answers with the same `invalid_credentials` and burns the
 *    same scrypt work, so neither the body nor the latency says whether the
 *    account exists.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clientIp, guardPost, sendError, sendJson, withErrorHandling } from '../_lib/http';
import { burnPasswordWork, verifyPassword } from '../_lib/password';
import {
  clearAttempts,
  isRateLimited,
  LOGIN_EMAIL_LIMIT,
  LOGIN_IP_LIMIT,
  recordAttempt,
} from '../_lib/rateLimit';
import { credentialsSchema, issuePaths } from '../_lib/schemas';
import { createSession, setSessionCookie } from '../_lib/session';
import {
  clearFailedLogins,
  findUserByEmail,
  isLocked,
  publicUser,
  registerFailedLogin,
} from '../_lib/users';

async function login(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardPost(req, res)) return;

  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    sendJson(res, 400, {
      error: 'invalid_input',
      fields: issuePaths(parsed.error),
    });
    return;
  }
  const { email, password } = parsed.data;

  const ipKey = `login:ip:${clientIp(req)}`;
  const emailKey = `login:email:${email}`;
  if (
    (await isRateLimited(ipKey, LOGIN_IP_LIMIT)) ||
    (await isRateLimited(emailKey, LOGIN_EMAIL_LIMIT))
  ) {
    sendError(res, 429, 'rate_limited');
    return;
  }

  const user = await findUserByEmail(email);
  if (!user) {
    // Hash anyway. Returning early here would make "no such account" measurably
    // faster than "wrong password" and hand out our user list by stopwatch.
    await burnPasswordWork(password);
    await recordAttempt(ipKey);
    await recordAttempt(emailKey);
    sendError(res, 401, 'invalid_credentials');
    return;
  }

  if (isLocked(user)) {
    sendError(res, 429, 'account_locked');
    return;
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    await registerFailedLogin(user);
    await recordAttempt(ipKey);
    await recordAttempt(emailKey);
    sendError(res, 401, 'invalid_credentials');
    return;
  }

  await clearFailedLogins(user.id);
  await clearAttempts(emailKey);

  const token = await createSession(user.id, req.headers['user-agent']);
  setSessionCookie(req, res, token);
  sendJson(res, 200, { user: publicUser(user) });
}

export default withErrorHandling(login);
