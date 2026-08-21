import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  emailVerified: true,
  reserveResult: 400 as number | null,
  /** Deltas the upstream stream yields before it ends. */
  deltas: ['Mon', 'day'] as string[],
  /** When set, the stream throws after yielding `deltas`. */
  failAfterDeltas: false,
  /** When false, no usage report arrives — as happens on an abort. */
  reportUsage: true,
};

const calls = {
  reserved: [] as number[],
  settled: [] as { hold: number; actual: number }[],
  spend: [] as number[],
};

vi.mock('../_lib/session.js', () => ({
  requireSession: async () => ({
    userId: 'user-a',
    sessionId: 'sess-1',
    email: 'a@example.com',
    emailVerified: state.emailVerified,
  }),
}));

vi.mock('../_lib/credits.js', () => ({
  creditScope: () => ({
    ensureGrantedBalance: async () => 400,
    summary: async () => ({ balance: 400, monthlyGrant: 300 }),
    reserve: async (amount: number) => {
      calls.reserved.push(amount);
      return state.reserveResult;
    },
    settle: async (hold: number, actual: number) => {
      calls.settled.push({ hold, actual });
      return 400 - actual;
    },
  }),
  monthlyBudgetExceeded: async () => false,
  recordSpend: async (_model: string, usage: { outputTokens: number }) => {
    calls.spend.push(usage.outputTokens);
  },
}));

vi.mock('../_lib/rateLimit.js', async (importActual) => {
  const actual = await importActual<typeof import('../_lib/rateLimit.js')>();
  return { ...actual, isRateLimited: async () => false, recordAttempt: async () => {} };
});

vi.mock('../_lib/anthropic.js', () => ({
  runStream: async function* (
    _request: unknown,
    onComplete: (r: { usage: unknown; stopReason: string | null }) => void,
  ) {
    for (const delta of state.deltas) yield delta;
    if (state.failAfterDeltas) throw new Error('upstream boom');
    if (state.reportUsage) {
      onComplete({
        usage: { inputTokens: 10_000, outputTokens: 2_000 },
        stopReason: 'end_turn',
      });
    }
  },
  classifyUpstream: () => ({ status: 502, code: 'ai_upstream_error' }),
}));

const handler = (await import('./chat.js')).default;

function makeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    chunks: [] as string[],
    ended: false,
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    writeHead(code: number, headers: Record<string, string>) {
      this.statusCode = code;
      for (const [key, value] of Object.entries(headers)) {
        this.headers[key.toLowerCase()] = value;
      }
      return this;
    },
    write(chunk: string) {
      this.chunks.push(chunk);
      return true;
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
      this.ended = true;
      return this;
    },
  };
  return res;
}

const asRes = (res: ReturnType<typeof makeRes>) => res as unknown as VercelResponse;

/** Parse the SSE frames the handler wrote. */
function frames(res: ReturnType<typeof makeRes>): Record<string, unknown>[] {
  return res.chunks
    .join('')
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk.replace(/^data: /, '')) as Record<string, unknown>);
}

function makeReq(body: unknown): VercelRequest {
  const req = {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'content-length': '300',
      origin: 'https://app.example',
      host: 'app.example',
    },
    on: () => req,
  };
  return req as unknown as VercelRequest;
}

const validBody = {
  model: 'claude-sonnet-4-6',
  maxTokens: 4_000,
  messages: [{ role: 'user', content: 'Plan my week' }],
};

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  process.env.SESSION_SECRET = 'session-secret';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-owner-key';
  state.emailVerified = true;
  state.reserveResult = 400;
  state.deltas = ['Mon', 'day'];
  state.failAfterDeltas = false;
  state.reportUsage = true;
  calls.reserved = [];
  calls.settled = [];
  calls.spend = [];
});

describe('POST /api/ai/chat — streaming', () => {
  it('streams deltas as SSE and closes with a done frame', async () => {
    const res = makeRes();
    await handler(makeReq(validBody), asRes(res));

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    // Without this a proxy can hold every delta until the end, quietly undoing
    // the entire point of the route.
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(frames(res)).toEqual([
      { type: 'delta', text: 'Mon' },
      { type: 'delta', text: 'day' },
      { type: 'done', stopReason: 'end_turn', credits: { charged: 6, balance: 394 } },
    ]);
    expect(res.ended).toBe(true);
  });

  it('charges the reported usage and refunds the rest of the hold', async () => {
    const res = makeRes();
    await handler(makeReq(validBody), asRes(res));

    const hold = calls.reserved[0];
    expect(calls.settled).toEqual([{ hold, actual: 6 }]);
    expect(hold).toBeGreaterThan(6);
    expect(calls.spend).toEqual([2_000]);
  });

  it('refuses before opening the stream when credits run out', async () => {
    state.reserveResult = null;
    const res = makeRes();
    await handler(makeReq(validBody), asRes(res));

    // Still a status code — nothing has been written yet.
    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({ error: 'insufficient_credits' });
    expect(res.chunks).toHaveLength(0);
  });

  it('reports a mid-stream failure in-band, since the status is already 200', async () => {
    state.failAfterDeltas = true;
    const res = makeRes();
    await handler(makeReq(validBody), asRes(res));

    expect(res.statusCode).toBe(200);
    expect(frames(res).at(-1)).toEqual({ type: 'error', code: 'ai_upstream_error' });
  });

  it('charges an estimate for a partial answer instead of refunding it', async () => {
    // Tokens already generated were billed upstream either way; refunding them
    // would make repeated mid-stream cancels free money out of the owner's pocket.
    state.failAfterDeltas = true;
    state.reportUsage = false;
    state.deltas = ['x'.repeat(4_000)];
    const res = makeRes();
    await handler(makeReq(validBody), asRes(res));

    expect(calls.settled).toHaveLength(1);
    expect(calls.settled[0].actual).toBeGreaterThan(0);
  });

  it('returns the whole hold when nothing was generated at all', async () => {
    state.failAfterDeltas = true;
    state.reportUsage = false;
    state.deltas = [];
    const res = makeRes();
    await handler(makeReq(validBody), asRes(res));

    expect(calls.settled).toEqual([{ hold: calls.reserved[0], actual: 0 }]);
    expect(calls.spend).toHaveLength(0);
  });

  it('settles exactly once, whatever happened', async () => {
    await handler(makeReq(validBody), asRes(makeRes()));
    expect(calls.settled).toHaveLength(1);

    calls.settled = [];
    state.failAfterDeltas = true;
    await handler(makeReq(validBody), asRes(makeRes()));
    expect(calls.settled).toHaveLength(1);
  });

  it('requires a verified email before streaming a single byte', async () => {
    state.emailVerified = false;
    const res = makeRes();
    await handler(makeReq(validBody), asRes(res));

    expect(res.statusCode).toBe(403);
    expect(res.chunks).toHaveLength(0);
    expect(calls.reserved).toHaveLength(0);
  });
});
