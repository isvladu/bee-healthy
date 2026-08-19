import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let session: {
  userId: string;
  sessionId: string;
  email: string;
  emailVerified: boolean;
} | null = null;
let limited = false;

const calls = {
  tokensIssuedFor: [] as string[],
  mailedTo: [] as string[],
  attempts: [] as string[],
};
let mailResult: 'sent' | 'skipped' | 'failed' = 'sent';

vi.mock('../_lib/session.js', () => ({
  requireSession: async (_req: VercelRequest, res: VercelResponse) => {
    if (!session) {
      res.status(401).json({ error: 'unauthenticated' });
      return null;
    }
    return session;
  },
}));

vi.mock('../_lib/emailTokens.js', () => ({
  issueEmailToken: async (userId: string) => {
    calls.tokensIssuedFor.push(userId);
    return 'fresh-token';
  },
}));

vi.mock('../_lib/mail.js', () => ({
  sendVerificationEmail: async (to: string) => {
    calls.mailedTo.push(to);
    return mailResult;
  },
}));

vi.mock('../_lib/rateLimit.js', async (importActual) => {
  const actual = await importActual<typeof import('../_lib/rateLimit.js')>();
  return {
    ...actual,
    isRateLimited: async () => limited,
    recordAttempt: async (key: string) => {
      calls.attempts.push(key);
    },
  };
});

const handler = (await import('./resend-verification.js')).default;

function makeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

const asRes = (res: ReturnType<typeof makeRes>) =>
  res as unknown as VercelResponse;

function makeReq(overrides: Record<string, unknown> = {}): VercelRequest {
  const { headers, ...rest } = overrides as {
    headers?: Record<string, string>;
  } & Record<string, unknown>;
  return {
    method: 'POST',
    body: {},
    ...rest,
    headers: {
      'content-type': 'application/json',
      'content-length': '2',
      origin: 'https://app.example',
      host: 'app.example',
      ...(headers ?? {}),
    },
  } as unknown as VercelRequest;
}

beforeEach(() => {
  session = {
    userId: 'user-a',
    sessionId: 'session-1',
    email: 'a@example.com',
    emailVerified: false,
  };
  limited = false;
  mailResult = 'sent';
  calls.tokensIssuedFor = [];
  calls.mailedTo = [];
  calls.attempts = [];
});

describe('POST /api/auth/resend-verification', () => {
  it('issues a fresh token and mails the session’s own address', async () => {
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(200);
    expect(calls.tokensIssuedFor).toEqual(['user-a']);
    // The address comes from the session, never the request — that is what
    // stops this being a way to mail arbitrary people.
    expect(calls.mailedTo).toEqual(['a@example.com']);
  });

  it('ignores any address supplied in the body', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { email: 'victim@example.com' } }), asRes(res));

    expect(calls.mailedTo).toEqual(['a@example.com']);
  });

  it('rejects an unauthenticated caller', async () => {
    session = null;
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(401);
    expect(calls.mailedTo).toHaveLength(0);
    expect(calls.tokensIssuedFor).toHaveLength(0);
  });

  it('rejects a cross-origin POST', async () => {
    const res = makeRes();
    await handler(
      makeReq({ headers: { origin: 'https://evil.example' } }),
      asRes(res),
    );

    expect(res.statusCode).toBe(403);
    expect(calls.mailedTo).toHaveLength(0);
  });

  it('does nothing but succeed when the email is already verified', async () => {
    session = { ...session!, emailVerified: true };
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadyVerified: true });
    expect(calls.mailedTo).toHaveLength(0);
  });

  it('refuses once the resend limit is reached', async () => {
    limited = true;
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
    expect(calls.tokensIssuedFor).toHaveLength(0);
  });

  it('counts the attempt against both the user and the IP', async () => {
    await handler(makeReq(), asRes(makeRes()));

    expect(calls.attempts).toContain('verify:user:user-a');
    expect(calls.attempts.some((key) => key.startsWith('verify:ip:'))).toBe(true);
  });

  it('reports when no mail provider is configured', async () => {
    mailResult = 'skipped';
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    // The UI uses this to avoid promising an email that was never sent.
    expect(res.body).toEqual({
      ok: true,
      alreadyVerified: false,
      email: 'skipped',
    });
  });

  it('never echoes the token back to the caller', async () => {
    const res = makeRes();
    await handler(makeReq(), asRes(res));
    expect(JSON.stringify(res.body)).not.toContain('fresh-token');
  });
});
