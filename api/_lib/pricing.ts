/**
 * What a hosted AI call costs, and which calls we are willing to make.
 *
 * Credits are denominated in money: **one credit = one US cent of Anthropic
 * list-price cost**, rounded up, minimum one per request. That keeps the
 * per-user quota and the owner's monthly ceiling in the same units, and means a
 * new model needs a price row here and nothing else.
 *
 * Rates are per million tokens. The arithmetic is done in *micro-dollars* as
 * integers — at $3/MTok a token costs exactly 3 micro-dollars, so
 * `micros = tokens × usdPerMTok` with no floats and no drift.
 */

export interface ModelPrice {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

/**
 * Anthropic list prices. Only models listed here can be served from the owner's
 * key — an unknown model is refused rather than billed at a guessed rate.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-opus-4-8': { input: 5, output: 25 },
};

/**
 * Models hosted users may select. Opus is deliberately absent: at 5× Sonnet's
 * output price a single multi-week plan could swallow a whole monthly grant, and
 * a user who genuinely wants it can bring their own key and pay for it directly.
 *
 * Mirrored by `HOSTED_MODEL_IDS` in `src/lib/llm/models.ts`; `pricing.test.ts`
 * holds the two copies together.
 */
export const HOSTED_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5'] as const;

export type HostedModel = (typeof HOSTED_MODELS)[number];

export const DEFAULT_HOSTED_MODEL: HostedModel = 'claude-sonnet-4-6';

export function isHostedModel(value: unknown): value is HostedModel {
  return (
    typeof value === 'string' && (HOSTED_MODELS as readonly string[]).includes(value)
  );
}

/**
 * Output ceiling for a hosted call. The client asks for what it needs; this caps
 * it, which caps the worst-case cost of any single request — and therefore the
 * size of the hold a user has to be able to afford.
 */
export const HOSTED_MAX_OUTPUT_TOKENS = 16000;

/** Bounds the prompt so nobody can hand the owner's key a novel to read. */
export const MAX_PROMPT_CHARS = 60_000;

/** One credit is one US cent. */
const MICROS_PER_CREDIT = 10_000;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Cache writes bill at 1.25× input; cache reads at 0.1×. Absent in practice today. */
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

/** List-price cost of one call, in whole micro-dollars. */
export function costMicros(model: string, usage: TokenUsage): number {
  const price = MODEL_PRICES[model];
  if (!price) throw new Error(`unpriced_model: ${model}`);
  const micros =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    (usage.cacheCreationTokens ?? 0) * price.input * 1.25 +
    (usage.cacheReadTokens ?? 0) * price.input * 0.1;
  return Math.ceil(micros);
}

/**
 * Credits owed for a call. Rounds up and never charges zero: a request that
 * costs a fraction of a cent still consumed a slot, and a free request is a free
 * way to probe the proxy.
 */
export function creditsFor(model: string, usage: TokenUsage): number {
  return Math.max(1, Math.ceil(costMicros(model, usage) / MICROS_PER_CREDIT));
}

/**
 * The worst case a request could cost, used as the up-front hold: every output
 * token it is allowed to produce, plus a deliberately generous estimate of the
 * prompt.
 *
 * Estimating input at ~2 characters per token overshoots real tokenization
 * (~3.5–4) on purpose. The hold is refunded within the same request, so
 * overshooting costs a user nothing; undershooting would let them overdraw.
 */
export function holdFor(
  model: string,
  promptChars: number,
  maxTokens: number,
): number {
  return creditsFor(model, {
    inputTokens: Math.ceil(promptChars / 2),
    outputTokens: maxTokens,
  });
}
