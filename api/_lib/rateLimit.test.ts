import { beforeEach, describe, expect, it, vi } from 'vitest';

let selectResult: {
  count: number | null;
  error: { message: string } | null;
} = { count: 0, error: null };

vi.mock('./supabase.js', () => ({
  serviceClient: () => ({
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        limit: () => Promise.resolve(selectResult),
      };
      return chain;
    },
  }),
}));

const { countAttempts, isRateLimited, LOGIN_EMAIL_LIMIT } =
  await import('./rateLimit.js');

beforeEach(() => {
  selectResult = { count: 0, error: null };
});

describe('countAttempts', () => {
  it('returns the count when the query succeeds', async () => {
    selectResult = { count: 7, error: null };
    expect(await countAttempts('login:email:a@example.com', 60_000)).toBe(7);
  });

  it('throws when the query errors', async () => {
    selectResult = { count: null, error: { message: 'boom' } };
    await expect(countAttempts('k', 60_000)).rejects.toThrow(
      'rate_limit_read_failed',
    );
  });

  it('fails closed when no count comes back', async () => {
    // The exact shape postgrest-js produces for an empty-bodied 404: no error,
    // no count. Treating this as 0 would silently disable rate limiting, which
    // is how a broken query once let unlimited signup attempts through.
    selectResult = { count: null, error: null };
    await expect(countAttempts('k', 60_000)).rejects.toThrow(
      'rate_limit_read_failed',
    );
  });
});

describe('isRateLimited', () => {
  it('never reports "not limited" when the count is unavailable', async () => {
    selectResult = { count: null, error: null };
    // The point: this must throw rather than resolve to false.
    await expect(isRateLimited('k', LOGIN_EMAIL_LIMIT)).rejects.toThrow();
  });

  it('limits at the rule maximum, not above it', async () => {
    selectResult = { count: LOGIN_EMAIL_LIMIT.max - 1, error: null };
    expect(await isRateLimited('k', LOGIN_EMAIL_LIMIT)).toBe(false);

    selectResult = { count: LOGIN_EMAIL_LIMIT.max, error: null };
    expect(await isRateLimited('k', LOGIN_EMAIL_LIMIT)).toBe(true);
  });
});
