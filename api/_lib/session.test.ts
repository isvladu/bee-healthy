import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Insert {
  table: string;
  row: Record<string, unknown>;
}
interface Update {
  table: string;
  values: Record<string, unknown>;
  filters: Record<string, unknown>;
}

const inserts: Insert[] = [];
const updates: Update[] = [];
let sessionRow: Record<string, unknown> | null = null;

vi.mock('./supabase', () => ({
  serviceClient: () => ({
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
        select() {
          const chain = {
            eq: () => chain,
            maybeSingle: () =>
              Promise.resolve({ data: sessionRow, error: null }),
          };
          return chain;
        },
        update(values: Record<string, unknown>) {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return chain;
            },
            is(column: string, value: unknown) {
              filters[`is:${column}`] = value;
              return chain;
            },
            then(resolve: (value: { error: null }) => unknown) {
              updates.push({ table, values, filters });
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return chain;
        },
      };
    },
  }),
}));

const {
  clearSessionCookie,
  createSession,
  readSessionToken,
  resolveSession,
  revokeAllSessions,
  revokeSession,
  SESSION_COOKIE,
  setSessionCookie,
} = await import('./session');
const { hashToken } = await import('./tokens');

function makeReq(overrides: Record<string, unknown> = {}): VercelRequest {
  const { headers, ...rest } = overrides as {
    headers?: Record<string, string>;
  } & Record<string, unknown>;
  return {
    method: 'GET',
    headers: { host: 'app.example', ...(headers ?? {}) },
    ...rest,
  } as unknown as VercelRequest;
}

function makeRes() {
  const res = {
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
  };
  return res as unknown as VercelResponse & { headers: Record<string, string> };
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  vi.stubEnv('SESSION_SECRET', 'test-session-secret');
  inserts.length = 0;
  updates.length = 0;
  sessionRow = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('session cookie', () => {
  it('is httpOnly, SameSite=Lax and Secure in production', () => {
    const res = makeRes();
    setSessionCookie(makeReq(), res, 'token-value');

    const cookie = res.headers['set-cookie'];
    expect(cookie).toContain(`${SESSION_COOKIE}=token-value`);
    // httpOnly is what removes the XSS token-theft vector the old
    // localStorage JWT had — JavaScript cannot read this cookie at all.
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Path=/');
  });

  it('drops Secure on localhost so `vercel dev` works over http', () => {
    const res = makeRes();
    setSessionCookie(makeReq({ headers: { host: 'localhost:3000' } }), res, 't');
    expect(res.headers['set-cookie']).not.toContain('Secure');
    expect(res.headers['set-cookie']).toContain('HttpOnly');
  });

  it('expires immediately when cleared', () => {
    const res = makeRes();
    clearSessionCookie(makeReq(), res);
    expect(res.headers['set-cookie']).toContain('Max-Age=0');
  });
});

describe('readSessionToken', () => {
  it('reads Vercel’s parsed cookies', () => {
    const req = makeReq({ cookies: { [SESSION_COOKIE]: 'abc' } });
    expect(readSessionToken(req)).toBe('abc');
  });

  it('falls back to parsing the raw header', () => {
    const req = makeReq({
      headers: { cookie: `theme=dark; ${SESSION_COOKIE}=xyz; other=1` },
    });
    expect(readSessionToken(req)).toBe('xyz');
  });

  it('returns null when there is no session cookie', () => {
    expect(readSessionToken(makeReq())).toBe(null);
    expect(readSessionToken(makeReq({ headers: { cookie: 'theme=dark' } }))).toBe(
      null,
    );
  });
});

describe('createSession', () => {
  it('stores only a hash — the raw token never reaches the database', async () => {
    const token = await createSession('user-a', 'Mozilla/5.0');

    expect(inserts).toHaveLength(1);
    const row = inserts[0].row;
    expect(row.user_id).toBe('user-a');
    expect(row.token_hash).toBe(hashToken(token));
    expect(row.token_hash).not.toBe(token);
    // The whole row, serialized, must not contain the token anywhere.
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('mints a different token every time', async () => {
    const a = await createSession('user-a', undefined);
    const b = await createSession('user-a', undefined);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 256 bits, base64url
  });

  it('truncates a long user-agent rather than storing it whole', async () => {
    await createSession('user-a', 'x'.repeat(1000));
    expect(String(inserts[0].row.user_agent)).toHaveLength(300);
  });
});

describe('resolveSession', () => {
  const validRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'session-1',
    user_id: 'user-a',
    expires_at: new Date(Date.now() + 29 * 24 * 3600_000).toISOString(),
    revoked_at: null,
    app_users: { email: 'a@example.com', email_verified: true },
    ...overrides,
  });

  const withCookie = () =>
    makeReq({ cookies: { [SESSION_COOKIE]: 'some-token' } });

  it('resolves a live session to its user', async () => {
    sessionRow = validRow();
    const session = await resolveSession(withCookie());

    expect(session).toEqual({
      userId: 'user-a',
      sessionId: 'session-1',
      email: 'a@example.com',
      emailVerified: true,
    });
  });

  it('returns null without a cookie', async () => {
    sessionRow = validRow();
    expect(await resolveSession(makeReq())).toBe(null);
  });

  it('returns null for an unknown token', async () => {
    sessionRow = null;
    expect(await resolveSession(withCookie())).toBe(null);
  });

  it('returns null for a revoked session — logout is instant', async () => {
    sessionRow = validRow({ revoked_at: new Date().toISOString() });
    expect(await resolveSession(withCookie())).toBe(null);
  });

  it('returns null for an expired session', async () => {
    sessionRow = validRow({
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await resolveSession(withCookie())).toBe(null);
  });

  it('slides the expiry once a session is past halfway', async () => {
    sessionRow = validRow({
      expires_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
    });
    await resolveSession(withCookie());

    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe('app_sessions');
    expect(Date.parse(String(updates[0].values.expires_at))).toBeGreaterThan(
      Date.now() + 29 * 24 * 3600_000,
    );
  });

  it('leaves a fresh session alone', async () => {
    sessionRow = validRow();
    await resolveSession(withCookie());
    expect(updates).toHaveLength(0);
  });
});

describe('revocation', () => {
  it('revokes one session by id', async () => {
    await revokeSession('session-1');
    expect(updates[0].filters.id).toBe('session-1');
    expect(updates[0].values.revoked_at).toBeTruthy();
  });

  it('revokes every live session for a user (used after a password reset)', async () => {
    await revokeAllSessions('user-a');
    expect(updates[0].filters.user_id).toBe('user-a');
    expect(updates[0].filters['is:revoked_at']).toBe(null);
  });
});
