import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  session: null as {
    userId: string;
    sessionId: string;
    email: string;
    emailVerified: boolean;
  } | null,
  budgetExceeded: false,
  rateLimited: false,
  reserveResult: 400 as number | null,
  upstreamError: null as { status: number; code: string } | null,
};

const calls = {
  attempts: [] as string[],
  reserved: [] as number[],
  settled: [] as { hold: number; actual: number }[],
  spend: [] as { model: string; outputTokens: number }[],
  upstream: [] as { model: string; maxTokens: number; schema: unknown }[],
};

vi.mock('../_lib/session.js', () => ({
  requireSession: async (_req: VercelRequest, res: VercelResponse) => {
    if (!state.session) {
      res.status(401).json({ error: 'unauthenticated' });
      return null;
    }
    return state.session;
  },
}));

vi.mock('../_lib/credits.js', () => ({
  creditScope: (userId: string) => ({
    ensureGrantedBalance: async () => 400,
    summary: async () => ({ balance: 400, monthlyGrant: 300 }),
    reserve: async (amount: number) => {
      calls.reserved.push(amount);
      return state.reserveResult;
    },
    settle: async (hold: number, actual: number) => {
      calls.settled.push({ hold, actual });
      expect(userId).toBe('user-a');
      return 400 - actual;
    },
  }),
  monthlyBudgetExceeded: async () => state.budgetExceeded,
  recordSpend: async (model: string, usage: { outputTokens: number }) => {
    calls.spend.push({ model, outputTokens: usage.outputTokens });
  },
}));

vi.mock('../_lib/rateLimit.js', async (importActual) => {
  const actual = await importActual<typeof import('../_lib/rateLimit.js')>();
  return {
    ...actual,
    isRateLimited: async () => state.rateLimited,
    recordAttempt: async (key: string) => {
      calls.attempts.push(key);
    },
  };
});

vi.mock('../_lib/anthropic.js', () => ({
  runStructured: async (
    request: { model: string; maxTokens: number },
    schema: unknown,
  ) => {
    calls.upstream.push({ ...request, schema });
    if (state.upstreamError) throw new Error('upstream boom');
    return {
      text: '{"title":"Cutting block"}',
      usage: { inputTokens: 10_000, outputTokens: 2_000 },
      stopReason: 'end_turn',
    };
  },
  classifyUpstream: () => state.upstreamError ?? { status: 502, code: 'ai_upstream_error' },
}));

const handler = (await import('./structured.js')).default;

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

const asRes = (res: ReturnType<typeof makeRes>) => res as unknown as VercelResponse;

const validBody = {
  model: 'claude-sonnet-4-6',
  maxTokens: 16_000,
  system: 'You are a dietitian.',
  prompt: 'Build a 7-day plan.',
  schema: { type: 'object', properties: { title: { type: 'string' } } },
};

function makeReq(body: unknown = validBody, method = 'POST'): VercelRequest {
  return {
    method,
    body,
    headers: {
      'content-type': 'application/json',
      'content-length': '400',
      origin: 'https://app.example',
      host: 'app.example',
    },
  } as unknown as VercelRequest;
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  process.env.SESSION_SECRET = 'session-secret';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-owner-key';
  state.session = {
    userId: 'user-a',
    sessionId: 'sess-1',
    email: 'a@example.com',
    emailVerified: true,
  };
  state.budgetExceeded = false;
  state.rateLimited = false;
  state.reserveResult = 400;
  state.upstreamError = null;
  calls.attempts = [];
  calls.reserved = [];
  calls.settled = [];
  calls.spend = [];
  calls.upstream = [];
});

describe('POST /api/ai/structured — who may spend the owner’s key', () => {
  it('rejects anything but POST', async () => {
    const res = makeRes();
    await handler(makeReq(validBody, 'GET'), asRes(res));
    expect(res.statusCode).toBe(405);
    expect(calls.upstream).toHaveLength(0);
  });

  it('rejects a cross-site origin', async () => {
    const res = makeRes();
    const req = makeReq();
    (req.headers as Record<string, string>).origin = 'https://evil.example';
    await handler(req, asRes(res));
    expect(res.statusCode).toBe(403);
    expect(calls.upstream).toHaveLength(0);
  });

  it('rejects an anonymous caller', async () => {
    state.session = null;
    const res = makeRes();
    await handler(makeReq(), asRes(res));
    expect(res.statusCode).toBe(401);
    expect(calls.reserved).toHaveLength(0);
  });

  it('requires a verified email — a throwaway signup is not free credits', async () => {
    state.session = { ...state.session!, emailVerified: false };
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'email_unverified' });
    expect(calls.upstream).toHaveLength(0);
  });

  it('stays off when no owner key is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'hosted_ai_unconfigured' });
  });

  it('stops everyone once the owner’s monthly ceiling is reached', async () => {
    state.budgetExceeded = true;
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'ai_budget_exhausted' });
    // Checked before the ledger is touched: no hold to unwind.
    expect(calls.reserved).toHaveLength(0);
    expect(calls.upstream).toHaveLength(0);
  });

  it('caps how fast one account can burn its balance', async () => {
    // Credits bound the *total* one account can spend; this bounds the burst,
    // so fifty concurrent streams can't drain a month's grant in seconds.
    state.rateLimited = true;
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
    expect(calls.upstream).toHaveLength(0);
  });

  it('counts every accepted call, not just failed ones', async () => {
    // Unlike the login limiter, each call here costs money whether it succeeds
    // or not, so success has to count against the cap too.
    await handler(makeReq(), asRes(makeRes()));
    expect(calls.attempts).toEqual(['ai:user:user-a']);
  });

  it('refuses a model it will not price', async () => {
    const res = makeRes();
    await handler(makeReq({ ...validBody, model: 'claude-opus-4-8' }), asRes(res));

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_input' });
    expect(calls.upstream).toHaveLength(0);
  });
});

describe('POST /api/ai/structured — the ledger', () => {
  it('holds the worst case, then charges only what was used', async () => {
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(200);
    const hold = calls.reserved[0];
    // 10k in + 2k out on Sonnet = $0.06 = 6 credits.
    expect(calls.settled).toEqual([{ hold, actual: 6 }]);
    expect(hold).toBeGreaterThan(6);
    expect(res.body).toMatchObject({
      text: '{"title":"Cutting block"}',
      credits: { charged: 6, balance: 394 },
    });
  });

  it('adds the call to the owner’s monthly spend', async () => {
    await handler(makeReq(), asRes(makeRes()));
    expect(calls.spend).toEqual([
      { model: 'claude-sonnet-4-6', outputTokens: 2_000 },
    ]);
  });

  it('turns away a user who cannot afford the worst case', async () => {
    state.reserveResult = null;
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    // 402, not 429: waiting doesn't help — the month has to roll over.
    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({ error: 'insufficient_credits' });
    expect(calls.upstream).toHaveLength(0);
    expect(calls.settled).toHaveLength(0);
  });

  it('returns the whole hold when the call fails', async () => {
    state.upstreamError = { status: 429, code: 'ai_rate_limited' };
    const res = makeRes();
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'ai_rate_limited' });
    expect(calls.settled).toEqual([{ hold: calls.reserved[0], actual: 0 }]);
    expect(calls.spend).toHaveLength(0);
  });

  it('settles exactly once per request', async () => {
    await handler(makeReq(), asRes(makeRes()));
    expect(calls.settled).toHaveLength(1);
  });
});

describe('POST /api/ai/structured — cost controls on the input', () => {
  it('clamps the output ceiling to ours, not the client’s', async () => {
    await handler(makeReq({ ...validBody, maxTokens: 900_000 }), asRes(makeRes()));
    expect(calls.upstream[0].maxTokens).toBe(16_000);
  });

  it('refuses a prompt larger than the cap', async () => {
    const res = makeRes();
    await handler(
      makeReq({ ...validBody, prompt: 'x'.repeat(60_001) }),
      asRes(res),
    );

    expect(res.statusCode).toBe(400);
    expect(calls.upstream).toHaveLength(0);
  });

  it('forwards the client’s JSON Schema untouched', async () => {
    // The server has no opinion about the shape of a diet plan; the feature's
    // zod schema is still the thing that validates the reply, client-side.
    await handler(makeReq(), asRes(makeRes()));
    expect(calls.upstream[0].schema).toEqual(validBody.schema);
  });
});
