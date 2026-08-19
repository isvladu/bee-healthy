import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let session: { userId: string; sessionId: string } | null = null;
let scopedTo = '';
let upserted: unknown[] = [];

vi.mock('../_lib/session', () => ({
  requireSession: async (_req: VercelRequest, res: VercelResponse) => {
    if (!session) {
      res.status(401).json({ error: 'unauthenticated' });
      return null;
    }
    return session;
  },
}));

vi.mock('../_lib/data', async (importActual) => {
  const actual = await importActual<typeof import('../_lib/data')>();
  return {
    ...actual,
    userScope: (userId: string) => {
      scopedTo = userId;
      return {
        upsertRecords: async (rows: unknown[]) => {
          upserted = rows;
          return rows.length;
        },
        listRecordsSince: async () => [],
      };
    },
  };
});

const handler = (await import('./push')).default;

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
    body: { records: [] },
    ...rest,
    headers: {
      'content-type': 'application/json',
      'content-length': '200',
      origin: 'https://app.example',
      host: 'app.example',
      ...(headers ?? {}),
    },
  } as unknown as VercelRequest;
}

const record = (overrides: Record<string, unknown> = {}) => ({
  id: 'rec-1',
  type: 'dietPlans',
  updatedAt: '2026-08-19T10:00:00.000Z',
  deleted: false,
  data: { title: 'Plan' },
  ...overrides,
});

beforeEach(() => {
  session = { userId: 'user-a', sessionId: 'session-1' };
  scopedTo = '';
  upserted = [];
});

describe('POST /api/sync/push', () => {
  it('rejects an unauthenticated request', async () => {
    session = null;
    const res = makeRes();
    await handler(makeReq({ body: { records: [record()] } }), asRes(res));

    expect(res.statusCode).toBe(401);
    expect(scopedTo).toBe('');
  });

  it('rejects a cross-origin request before it looks at the session', async () => {
    const res = makeRes();
    await handler(
      makeReq({ headers: { origin: 'https://evil.example' } }),
      asRes(res),
    );

    expect(res.statusCode).toBe(403);
    expect(scopedTo).toBe('');
  });

  it('rejects any method but POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), asRes(res));
    expect(res.statusCode).toBe(405);
  });

  it('scopes the write to the session user', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { records: [record()] } }), asRes(res));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ pushed: 1 });
    expect(scopedTo).toBe('user-a');
  });

  it('takes the user from the cookie even when the body names someone else', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: { userId: 'user-victim', user_id: 'user-victim', records: [record()] },
      }),
      asRes(res),
    );

    // The handler never reads a user id from the request at all.
    expect(scopedTo).toBe('user-a');
    expect(res.statusCode).toBe(200);
  });

  it('refuses to write a record type that is not syncable', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { records: [record({ type: 'app_users' })] } }),
      asRes(res),
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('invalid_input');
    expect(upserted).toHaveLength(0);
  });

  it('refuses a batch larger than the server cap', async () => {
    const res = makeRes();
    const records = Array.from({ length: 201 }, (_, index) =>
      record({ id: `rec-${index}` }),
    );
    await handler(makeReq({ body: { records } }), asRes(res));

    expect(res.statusCode).toBe(400);
    expect(upserted).toHaveLength(0);
  });

  it('reports invalid input as field paths, never as values', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { records: [record({ updatedAt: 'not-a-date' })] } }),
      asRes(res),
    );

    const body = res.body as { error: string; fields: string };
    expect(body.error).toBe('invalid_input');
    expect(body.fields).toContain('updatedAt');
    expect(JSON.stringify(body)).not.toContain('not-a-date');
  });
});
