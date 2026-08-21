/**
 * `GET /api/ai/usage` — can this user call the hosted model, and how much is
 * left?
 *
 * The client *discovers* hosted AI from here rather than from a `VITE_` flag,
 * the same way it discovers the backend from `/api/auth/me`: one answer that
 * can't drift out of step with the server. Every "no" carries a `reason` so the
 * settings card can say something useful instead of hiding the feature.
 *
 * Answers 200 even when hosted AI is unavailable — "you can't use this, here's
 * why" is a successful answer to this question, and it keeps the client's
 * handling to one shape.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { creditScope, monthlyBudgetExceeded } from '../_lib/credits.js';
import { isHostedAiConfigured } from '../_lib/env.js';
import { guardGet, sendJson, withErrorHandling } from '../_lib/http.js';
import {
  DEFAULT_HOSTED_MODEL,
  HOSTED_MODELS,
  HOSTED_MAX_OUTPUT_TOKENS,
} from '../_lib/pricing.js';
import { resolveSession } from '../_lib/session.js';

type Reason =
  | 'unconfigured'
  | 'unauthenticated'
  | 'email_unverified'
  | 'budget_exhausted'
  | 'insufficient_credits';

function unavailable(res: VercelResponse, reason: Reason): void {
  sendJson(res, 200, { available: false, reason });
}

async function usage(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardGet(req, res)) return;

  if (!isHostedAiConfigured()) return unavailable(res, 'unconfigured');

  const session = await resolveSession(req);
  if (!session) return unavailable(res, 'unauthenticated');
  if (!session.emailVerified) return unavailable(res, 'email_unverified');

  if (await monthlyBudgetExceeded()) return unavailable(res, 'budget_exhausted');

  const { balance, monthlyGrant } = await creditScope(session.userId).summary();

  sendJson(res, 200, {
    available: balance > 0,
    ...(balance > 0 ? {} : { reason: 'insufficient_credits' satisfies Reason }),
    balance,
    monthlyGrant,
    models: HOSTED_MODELS,
    defaultModel: DEFAULT_HOSTED_MODEL,
    maxOutputTokens: HOSTED_MAX_OUTPUT_TOKENS,
  });
}

export default withErrorHandling(usage);
