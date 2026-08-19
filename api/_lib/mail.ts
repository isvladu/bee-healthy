/**
 * Transactional email for verification and password reset, via Resend's REST
 * API (§5.11 — chosen for its free tier and serverless-friendly DX). Called
 * with `fetch`, so no SDK dependency.
 *
 * Optional and graceful, like every other server piece: with `RESEND_API_KEY`
 * unset, sending is skipped and the caller carries on. Signup still works; the
 * account is simply unverified until email is configured.
 *
 * Tokens are NEVER logged. A reset link in Vercel Runtime Logs would be a
 * working credential sitting in a log stream. `MAIL_DEBUG=1` opts into printing
 * links for local development only — do not set it in production.
 */
import { appUrl } from './env';

export type MailResult = 'sent' | 'skipped' | 'failed';

interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Logged in place of the body when `MAIL_DEBUG` is on. */
  debugLink?: string;
}

async function send(mail: Mail): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    console.log(
      JSON.stringify({
        level: 'info',
        source: 'api',
        message: 'mail skipped — RESEND_API_KEY/MAIL_FROM unset',
        where: 'auth',
      }),
    );
    if (process.env.MAIL_DEBUG === '1' && mail.debugLink) {
      console.log(`[mail-debug] ${mail.subject}: ${mail.debugLink}`);
    }
    return 'skipped';
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    });
    if (!response.ok) {
      // Status only — the body can echo the recipient address.
      console.error(
        JSON.stringify({
          level: 'error',
          source: 'api',
          message: `mail send failed (${response.status})`,
          where: 'auth',
        }),
      );
      return 'failed';
    }
    return 'sent';
  } catch {
    console.error(
      JSON.stringify({
        level: 'error',
        source: 'api',
        message: 'mail send threw',
        where: 'auth',
      }),
    );
    return 'failed';
  }
}

export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<MailResult> {
  const link = `${appUrl()}/verify?token=${encodeURIComponent(token)}`;
  return send({
    to,
    subject: 'Confirm your Bee Healthy email',
    debugLink: link,
    text: [
      'Welcome to Bee Healthy!',
      '',
      'Confirm your email address by opening this link:',
      link,
      '',
      'The link expires in 24 hours.',
      "If you didn't create this account, you can ignore this message.",
    ].join('\n'),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
): Promise<MailResult> {
  const link = `${appUrl()}/reset?token=${encodeURIComponent(token)}`;
  return send({
    to,
    subject: 'Reset your Bee Healthy password',
    debugLink: link,
    text: [
      'Someone asked to reset the password for this Bee Healthy account.',
      '',
      'Set a new password here:',
      link,
      '',
      'The link expires in 1 hour and can be used once.',
      "If this wasn't you, no action is needed — your password is unchanged.",
    ].join('\n'),
  });
}
