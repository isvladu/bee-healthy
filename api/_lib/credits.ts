/**
 * The credit ledger — user-scoped access to `app_credits` / `app_credit_events`,
 * plus the owner's global spend ceiling.
 *
 * Same contract as `userScope` in `data.ts`, for the same reason: the service
 * role bypasses RLS, so authorization is this closure. `creditScope(userId)`
 * captures the *session* user and **no method accepts a user id**. If you add a
 * method here it must be reachable only through the captured `userId`.
 *
 * Why a hold-and-settle dance rather than a plain decrement: the cost of a call
 * is not known until it finishes, but the affordability check has to happen
 * before it starts. So a request reserves its worst case (`holdFor`), runs, and
 * settles — the unused part of the hold comes straight back. A user can never
 * overdraw, and two concurrent requests cannot both spend the last credit
 * because the `balance >= amount` test lives inside the UPDATE.
 */
import { aiMonthlyBudgetMicros, currentPeriod, freeMonthlyCredits } from './env.js';
import { serviceClient } from './supabase.js';
import { costMicros, type TokenUsage } from './pricing.js';

export interface CreditSummary {
  balance: number;
  /** What the balance is topped up to at the start of each month. */
  monthlyGrant: number;
}

export function creditScope(userId: string) {
  /**
   * Balance for the current month, applying the free grant if this is the
   * user's first request of it. Idempotent — the period stamp on the row is
   * what decides, so there is no scheduled job to miss.
   */
  async function ensureGrantedBalance(): Promise<number> {
    const { data, error } = await serviceClient().rpc('ai_ensure_monthly_grant', {
      p_user: userId,
      p_period: currentPeriod(),
      p_grant: freeMonthlyCredits(),
    });
    if (error) throw new Error(`credits_grant_failed: ${error.message}`);
    return numeric(data, 'credits_grant_failed: no balance returned');
  }

  return {
    ensureGrantedBalance,

    async summary(): Promise<CreditSummary> {
      return {
        balance: await ensureGrantedBalance(),
        monthlyGrant: freeMonthlyCredits(),
      };
    },

    /**
     * Hold `amount` credits. Returns the balance after the hold, or `null` when
     * the user cannot afford it — the caller must not start the call in that
     * case, and there is nothing to release.
     */
    async reserve(amount: number): Promise<number | null> {
      const { data, error } = await serviceClient().rpc('ai_reserve_credits', {
        p_user: userId,
        p_amount: amount,
      });
      if (error) throw new Error(`credits_reserve_failed: ${error.message}`);
      // A null balance is the function's way of saying the predicate failed.
      return data === null || data === undefined ? null : numeric(data, '');
    },

    /**
     * Close out a hold: charge `actual` and refund the rest, recording one
     * ledger event. Call it on the failure path too, with `actual` 0 — a call
     * that never produced tokens must not leave credits stranded.
     */
    async settle(
      hold: number,
      actual: number,
      meta: { model: string; usage?: TokenUsage },
    ): Promise<number> {
      const { data, error } = await serviceClient().rpc('ai_settle_credits', {
        p_user: userId,
        p_hold: hold,
        p_actual: actual,
        p_model: meta.model,
        p_input_tokens: meta.usage?.inputTokens ?? null,
        p_output_tokens: meta.usage?.outputTokens ?? null,
      });
      if (error) throw new Error(`credits_settle_failed: ${error.message}`);
      return numeric(data, 'credits_settle_failed: no balance returned');
    },
  };
}

export type CreditScope = ReturnType<typeof creditScope>;

/**
 * Has this month's spend already passed the owner's ceiling? Read before
 * starting a call; `recordSpend` adds to the total after one completes.
 *
 * Failing to read the total throws rather than returning false — a spend
 * control that cannot answer must not answer "plenty left" (same rule as the
 * rate limiter's count query).
 */
export async function monthlyBudgetExceeded(): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from('app_ai_spend')
    .select('micros')
    .eq('period', currentPeriod())
    .maybeSingle();
  if (error) throw new Error(`ai_spend_read_failed: ${error.message}`);
  const spent = data ? Number((data as { micros: number | string }).micros) : 0;
  if (!Number.isFinite(spent)) {
    throw new Error('ai_spend_read_failed: unreadable total');
  }
  return spent >= aiMonthlyBudgetMicros();
}

/** Add one call's list-price cost to this month's total. */
export async function recordSpend(
  model: string,
  usage: TokenUsage,
): Promise<void> {
  const micros = costMicros(model, usage);
  if (micros <= 0) return;
  const { error } = await serviceClient().rpc('ai_record_spend', {
    p_period: currentPeriod(),
    p_micros: micros,
  });
  if (error) throw new Error(`ai_spend_write_failed: ${error.message}`);
}

/** `bigint` columns come back from PostgREST as strings; normalize once. */
function numeric(value: unknown, message: string): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new Error(message || 'credits_unreadable_balance');
  }
  return parsed;
}
