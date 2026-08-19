import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  user: null as Record<string, unknown> | null,
  passwordValid: true,
  locked: false,
  rateLimited: false,
};

const calls = {
  burned: 0,
  failuresRecorded: 0,
  attemptsRecorded: [] as string[],
  attemptsCleared: [] as string[],
  sessionsFor: [] as string[],
  cookiesSet: 0,
};

vi.mock('../_lib/users', async (importActual) => {
  const actual = await importActual<typeof import('../_lib/users')>();
  return {
    ...actual,
    findUserByEmail: async () => state.user,
    isLocked: () => state.locked,
    registerFailedLogin: async () => {
      calls.failuresRecorded++;
    },
    clearFailedLogins: async () => {},
  };
});

vi.mock('../_lib/password', async (importActual) => {
  const actual = await importActual<typeof import('../_lib/password')>();
  return {
    ...actual,
    verifyPassword: async () => state.passwordValid,
    burnPasswordWork: async () => {
      calls.burned++;
    },
  };
});

vi.mock('../_lib/rateLimit', async (importActual) => {
  const actual = await importActual<typeof import('../_lib/rateLimit')>();
  return {
    ...actual,
    isRateLimited: async () => state.rateLimited,
    recordAttempt: async (key: string) => {
      calls.attemptsRecorded.push(key);
    },
    clearAttempts: async (key: string) => {
      calls.attemptsCleared.push(key);
    },
  };
});

vi.mock('../_lib/session', () => ({
  createSession: async (userId: string) => {
    calls.sessionsFor.push(userId);
    return 'issued-token';
  },
  setSessionCookie: () => {
    calls.cookiesSet++;
  },
}));

const handler = (await import('./login')).default;

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

function makeReq(body: unknown = {}): VercelRequest {
  return {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'content-length': '120',
      origin: 'https://app.example',
      host: 'app.example',
    },
  } as unknown as VercelRequest;
}

const credentials = { email: 'a@example.com', password: 'a-good-password' };

const existingUser = {
  id: 'user-a',
  email: 'a@example.com',
  password_hash: 'scrypt$65536$8$1$c2FsdA==$aGFzaA==',
  email_verified: true,
  failed_attempts: 0,
  locked_until: null,
};

beforeEach(() => {
  state.user = { ...existingUser };
  state.passwordValid = true;
  state.locked = false;
  state.rateLimited = false;
  calls.burned = 0;
  calls.failuresRecorded = 0;
  calls.attemptsRecorded = [];
  calls.attemptsCleared = [];
  calls.sessionsFor = [];
  calls.cookiesSet = 0;
});

describe('POST /api/auth/login — account enumeration', () => {
  it('answers identically for an unknown email and a wrong password', async () => {
    state.user = null;
    const unknown = makeRes();
    await handler(makeReq(credentials), asRes(unknown));

    state.user = { ...existingUser };
    state.passwordValid = false;
    const wrong = makeRes();
    await handler(makeReq(credentials), asRes(wrong));

    // Same status and the same bytes — nothing here says whether the account
    // exists.
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.body).toEqual({ error: 'invalid_credentials' });
    expect(wrong.body).toEqual(unknown.body);
  });

  it('burns hashing work on the unknown-email path so timing does not leak either', async () => {
    state.user = null;
    await handler(makeReq(credentials), asRes(makeRes()));

    // Returning early without hashing would make "no such account" measurably
    // faster than "wrong password".
    expect(calls.burned).toBe(1);
  });

  it('counts a failed attempt against both the IP and the account', async () => {
    state.passwordValid = false;
    await handler(makeReq(credentials), asRes(makeRes()));

    expect(calls.attemptsRecorded).toHaveLength(2);
    expect(calls.attemptsRecorded.some((key) => key.startsWith('login:ip:'))).toBe(
      true,
    );
    expect(
      calls.attemptsRecorded.some((key) => key === 'login:email:a@example.com'),
    ).toBe(true);
  });
});

describe('POST /api/auth/login — lockout and rate limiting', () => {
  it('records the failure against the account so lockout can escalate', async () => {
    state.passwordValid = false;
    await handler(makeReq(credentials), asRes(makeRes()));
    expect(calls.failuresRecorded).toBe(1);
  });

  it('refuses a locked account without checking the password', async () => {
    state.locked = true;
    const res = makeRes();
    await handler(makeReq(credentials), asRes(res));

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'account_locked' });
    expect(calls.sessionsFor).toHaveLength(0);
  });

  it('refuses a rate-limited caller before touching the database', async () => {
    state.rateLimited = true;
    const res = makeRes();
    await handler(makeReq(credentials), asRes(res));

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
    expect(calls.burned).toBe(0);
    expect(calls.sessionsFor).toHaveLength(0);
  });
});

describe('POST /api/auth/login — success', () => {
  it('mints a session, sets the cookie and clears the account’s attempts', async () => {
    const res = makeRes();
    await handler(makeReq(credentials), asRes(res));

    expect(res.statusCode).toBe(200);
    expect(calls.sessionsFor).toEqual(['user-a']);
    expect(calls.cookiesSet).toBe(1);
    expect(calls.attemptsCleared).toEqual(['login:email:a@example.com']);
  });

  it('returns only the public user shape', async () => {
    const res = makeRes();
    await handler(makeReq(credentials), asRes(res));

    expect(res.body).toEqual({
      user: { id: 'user-a', email: 'a@example.com', emailVerified: true },
    });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('scrypt');
    expect(serialized).not.toContain(credentials.password);
    expect(serialized).not.toContain('issued-token');
  });

  it('normalizes the email before looking it up', async () => {
    const res = makeRes();
    await handler(
      makeReq({ email: '  A@Example.COM ', password: credentials.password }),
      asRes(res),
    );

    expect(res.statusCode).toBe(200);
    expect(calls.attemptsCleared).toEqual(['login:email:a@example.com']);
  });
});

describe('POST /api/auth/login — input validation', () => {
  it('rejects a malformed body without echoing the password back', async () => {
    const res = makeRes();
    await handler(makeReq({ email: 'nope', password: 'short' }), asRes(res));

    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; fields: string };
    expect(body.error).toBe('invalid_input');
    expect(JSON.stringify(body)).not.toContain('short');
  });

  it('rejects a cross-origin POST', async () => {
    const res = makeRes();
    const req = makeReq(credentials);
    (req.headers as Record<string, string>).origin = 'https://evil.example';
    await handler(req, asRes(res));

    expect(res.statusCode).toBe(403);
    expect(calls.sessionsFor).toHaveLength(0);
  });
});
