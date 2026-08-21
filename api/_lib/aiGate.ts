/**
 * Everything that has to be true before the owner's Anthropic key is used, and
 * everything that has to happen after.
 *
 * Both `/api/ai/*` routes share this so the checks can't drift apart — a new
 * endpoint that forgets the spend ceiling or the credit hold would be a hole in
 * the only thing standing between a signed-up stranger and the owner's bill.
 *
 * Order matters: the cheap refusals (unconfigured, unverified, over budget) come
 * before the ones that touch the ledger, so a request that was never going to
 * run doesn't churn balances. The method/origin/size guard runs earlier still,
 * in the handler itself, exactly as it does on every other POST route.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { creditScope, monthlyBudgetExceeded, recordSpend } from './credits.js';
import { isHostedAiConfigured } from './env.js';
import { sendError } from './http.js';
import { creditsFor, holdFor, MAX_PROMPT_CHARS, type TokenUsage } from './pricing.js';
import { AI_USER_LIMIT, isRateLimited, recordAttempt } from './rateLimit.js';
import { requireSession } from './session.js';

export interface OpenCall {
  model: string;
  /** Credits held up front; hand this back to `closeHostedCall`. */
  hold: number;
  scope: ReturnType<typeof creditScope>;
}

/**
 * Run every precondition and reserve the request's worst-case cost. Returns
 * null when it has already answered the request — the caller must not proceed.
 */
export async function openHostedCall(
  req: VercelRequest,
  res: VercelResponse,
  call: { model: string; maxTokens: number; promptChars: number },
): Promise<OpenCall | null> {
  const session = await requireSession(req, res);
  if (!session) return null;

  if (!isHostedAiConfigured()) {
    sendError(res, 503, 'hosted_ai_unconfigured');
    return null;
  }

  // Hosted AI spends the owner's money, so it is gated on a verified address
  // where sync is not: a throwaway signup would otherwise be free credits.
  if (!session.emailVerified) {
    sendError(res, 403, 'email_unverified');
    return null;
  }

  if (call.promptChars > MAX_PROMPT_CHARS) {
    sendError(res, 413, 'prompt_too_large');
    return null;
  }

  // Burst control. Unlike the auth limits this one guards spend rather than
  // guessing, so it counts *every* accepted call, not just failures.
  const limitKey = `ai:user:${session.userId}`;
  if (await isRateLimited(limitKey, AI_USER_LIMIT)) {
    sendError(res, 429, 'rate_limited');
    return null;
  }

  if (await monthlyBudgetExceeded()) {
    sendError(res, 503, 'ai_budget_exhausted');
    return null;
  }

  const scope = creditScope(session.userId);
  await scope.ensureGrantedBalance();

  const hold = holdFor(call.model, call.promptChars, call.maxTokens);
  const remaining = await scope.reserve(hold);
  if (remaining === null) {
    // 402 rather than 429: waiting doesn't help, the month has to roll over (or
    // the user has to bring their own key).
    sendError(res, 402, 'insufficient_credits');
    return null;
  }

  await recordAttempt(limitKey);
  return { model: call.model, hold, scope };
}

export interface CloseResult {
  /** Credits actually charged for the call. */
  charged: number;
  /** The user's balance once the unused hold was returned. */
  balance: number;
}

/**
 * Release the hold, charge what the call really cost, and add it to the month's
 * spend total. Pass no usage for a call that produced nothing — the whole hold
 * comes back and the ledger stays quiet.
 *
 * **Call this exactly once per `openHostedCall`.** It never throws: by the time
 * it runs the model has already been billed upstream, and turning a bookkeeping
 * hiccup into a 500 would throw away an answer the user has paid for (or, on a
 * streaming route, arrive after the response has begun). A failure is logged and
 * returns null; the worst case is a hold that stays reserved until the next
 * monthly top-up, which is the safe direction to fail.
 */
export async function settleHostedCall(
  open: OpenCall,
  usage?: TokenUsage,
): Promise<CloseResult | null> {
  try {
    const charged = usage ? creditsFor(open.model, usage) : 0;
    const balance = await open.scope.settle(open.hold, charged, {
      model: open.model,
      usage,
    });
    if (usage) {
      // Separate from the ledger write above: the user's balance is already
      // correct, and losing the owner's running total is a lesser failure than
      // reporting the wrong balance back to them.
      try {
        await recordSpend(open.model, usage);
      } catch (err) {
        logSettleFailure(err);
      }
    }
    return { charged, balance };
  } catch (err) {
    logSettleFailure(err);
    return null;
  }
}

function logSettleFailure(err: unknown): void {
  console.error(
    JSON.stringify({
      level: 'error',
      source: 'api',
      message: err instanceof Error ? err.message : 'settle failed',
      where: 'ai',
    }),
  );
}
