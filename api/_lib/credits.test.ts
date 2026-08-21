import { beforeEach, describe, expect, it, vi } from 'vitest';

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

const rpcs: RpcCall[] = [];
let rpcResult: unknown = 0;
let rpcError: { message: string } | null = null;
let spendRow: { micros: number | string } | null = null;
let spendError: { message: string } | null = null;

vi.mock('./supabase.js', () => ({
  serviceClient: () => ({
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: rpcResult, error: rpcError });
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: () =>
                  Promise.resolve({ data: spendRow, error: spendError }),
              };
            },
          };
        },
      };
    },
  }),
}));

const { creditScope, monthlyBudgetExceeded, recordSpend } = await import(
  './credits.js'
);

beforeEach(() => {
  rpcs.length = 0;
  rpcResult = 0;
  rpcError = null;
  spendRow = null;
  spendError = null;
  process.env.AI_FREE_MONTHLY_CREDITS = '300';
  process.env.AI_MONTHLY_BUDGET_USD = '25';
});

describe('creditScope — cross-user isolation', () => {
  it('stamps every call with the scope owner, not anything from the caller', async () => {
    // Same discipline as `userScope`: no method takes a user id, so there is no
    // way to express a cross-user operation with this API.
    await creditScope('user-a').reserve(5);
    await creditScope('user-a').settle(5, 3, { model: 'claude-haiku-4-5' });
    await creditScope('user-a').ensureGrantedBalance();

    expect(rpcs).toHaveLength(3);
    for (const call of rpcs) {
      expect(call.args.p_user).toBe('user-a');
    }
  });

  it('gives two scopes two different owners for identical input', async () => {
    await creditScope('user-a').reserve(5);
    await creditScope('user-b').reserve(5);

    expect(rpcs[0].args.p_user).toBe('user-a');
    expect(rpcs[1].args.p_user).toBe('user-b');
  });
});

describe('reserve', () => {
  it('reports insufficient credits as null rather than a balance', async () => {
    // The SQL function returns NULL when `balance >= amount` failed, which is
    // the whole concurrency story: the row lock decides, not the caller.
    rpcResult = null;
    expect(await creditScope('user-a').reserve(50)).toBeNull();
  });

  it('returns the balance after the hold', async () => {
    rpcResult = 245;
    expect(await creditScope('user-a').reserve(55)).toBe(245);
  });

  it('surfaces a failed ledger write instead of pretending it worked', async () => {
    rpcError = { message: 'connection reset' };
    await expect(creditScope('user-a').reserve(5)).rejects.toThrow(
      /credits_reserve_failed/,
    );
  });
});

describe('settle', () => {
  it('passes the hold and the actual charge so the difference is refunded', async () => {
    rpcResult = 297;
    await creditScope('user-a').settle(26, 3, {
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 1200, outputTokens: 400 },
    });

    expect(rpcs[0].fn).toBe('ai_settle_credits');
    expect(rpcs[0].args).toMatchObject({
      p_hold: 26,
      p_actual: 3,
      p_model: 'claude-sonnet-4-6',
      p_input_tokens: 1200,
      p_output_tokens: 400,
    });
  });

  it('records no token counts for a call that produced nothing', async () => {
    await creditScope('user-a').settle(26, 0, { model: 'claude-sonnet-4-6' });

    expect(rpcs[0].args).toMatchObject({
      p_actual: 0,
      p_input_tokens: null,
      p_output_tokens: null,
    });
  });

  it('never carries prompt or completion text into the ledger', async () => {
    await creditScope('user-a').settle(26, 3, {
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    // The ledger is a record of spend, not of what anyone asked the model.
    const serialized = JSON.stringify(rpcs[0].args);
    expect(Object.keys(rpcs[0].args)).toEqual([
      'p_user',
      'p_hold',
      'p_actual',
      'p_model',
      'p_input_tokens',
      'p_output_tokens',
    ]);
    expect(serialized).not.toMatch(/prompt|content|message/i);
  });
});

describe('ensureGrantedBalance', () => {
  it('asks for the configured grant against the current month', async () => {
    process.env.AI_FREE_MONTHLY_CREDITS = '120';
    rpcResult = 120;

    expect(await creditScope('user-a').ensureGrantedBalance()).toBe(120);
    expect(rpcs[0].fn).toBe('ai_ensure_monthly_grant');
    expect(rpcs[0].args.p_grant).toBe(120);
    expect(rpcs[0].args.p_period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('falls back to the default grant when the env var is nonsense', async () => {
    // A typo'd number must not silently become "no free credits" — or worse,
    // an unbounded one.
    process.env.AI_FREE_MONTHLY_CREDITS = 'lots';
    rpcResult = 300;

    await creditScope('user-a').ensureGrantedBalance();
    expect(rpcs[0].args.p_grant).toBe(300);
  });
});

describe('monthlyBudgetExceeded', () => {
  it('is false with no spend recorded yet this month', async () => {
    spendRow = null;
    expect(await monthlyBudgetExceeded()).toBe(false);
  });

  it('trips once the month passes the configured ceiling', async () => {
    process.env.AI_MONTHLY_BUDGET_USD = '10';
    spendRow = { micros: 10_000_000 };
    expect(await monthlyBudgetExceeded()).toBe(true);

    spendRow = { micros: 9_999_999 };
    expect(await monthlyBudgetExceeded()).toBe(false);
  });

  it('reads a bigint returned as a string', async () => {
    process.env.AI_MONTHLY_BUDGET_USD = '10';
    spendRow = { micros: '12000000' };
    expect(await monthlyBudgetExceeded()).toBe(true);
  });

  it('fails closed when it cannot read the total', async () => {
    // A spend control that cannot answer must not answer "plenty left" — same
    // rule as the rate limiter's count query.
    spendError = { message: 'relation does not exist' };
    await expect(monthlyBudgetExceeded()).rejects.toThrow(/ai_spend_read_failed/);
  });
});

describe('recordSpend', () => {
  it('adds this call’s list-price cost to the month', async () => {
    await recordSpend('claude-sonnet-4-6', {
      inputTokens: 10_000,
      outputTokens: 2_000,
    });

    expect(rpcs[0].fn).toBe('ai_record_spend');
    expect(rpcs[0].args.p_micros).toBe(60_000);
  });
});
