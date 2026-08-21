import { describe, expect, it } from 'vitest';
import { HOSTED_MODEL_IDS } from '../../src/lib/llm/models.js';
import {
  costMicros,
  creditsFor,
  DEFAULT_HOSTED_MODEL,
  holdFor,
  HOSTED_MODELS,
  isHostedModel,
  MODEL_PRICES,
} from './pricing.js';

describe('costMicros', () => {
  it('prices a Sonnet call at list rates', () => {
    // 10k input @ $3/MTok = $0.03, 2k output @ $15/MTok = $0.03 → $0.06.
    expect(
      costMicros('claude-sonnet-4-6', { inputTokens: 10_000, outputTokens: 2_000 }),
    ).toBe(60_000);
  });

  it('prices Haiku well below Sonnet for identical usage', () => {
    const usage = { inputTokens: 10_000, outputTokens: 2_000 };
    expect(costMicros('claude-haiku-4-5', usage)).toBeLessThan(
      costMicros('claude-sonnet-4-6', usage),
    );
  });

  it('bills cache reads at a tenth of input and writes above it', () => {
    const read = costMicros('claude-sonnet-4-6', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 10_000,
    });
    const write = costMicros('claude-sonnet-4-6', {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 10_000,
    });
    expect(read).toBe(3_000);
    expect(write).toBe(37_500);
  });

  it('refuses to guess a rate for an unknown model', () => {
    // Guessing would mean serving a model nobody budgeted for.
    expect(() =>
      costMicros('claude-something-new', { inputTokens: 1, outputTokens: 1 }),
    ).toThrow(/unpriced_model/);
  });
});

describe('creditsFor', () => {
  it('converts micro-dollars to whole cents, rounding up', () => {
    // $0.06 → 6 credits.
    expect(
      creditsFor('claude-sonnet-4-6', { inputTokens: 10_000, outputTokens: 2_000 }),
    ).toBe(6);
  });

  it('never charges zero for a call that happened', () => {
    // A free request is a free way to probe the proxy.
    expect(creditsFor('claude-haiku-4-5', { inputTokens: 1, outputTokens: 1 })).toBe(1);
  });
});

describe('holdFor', () => {
  it('covers the worst case the request could cost', () => {
    const promptChars = 4_000;
    const maxTokens = 16_000;
    const hold = holdFor('claude-sonnet-4-6', promptChars, maxTokens);

    // The hold must exceed any outcome the request can produce, or a user could
    // overdraw by finishing a call they could not afford to start.
    const worstRealistic = creditsFor('claude-sonnet-4-6', {
      // Real tokenization is ~3.5–4 chars/token; the hold assumes 2.
      inputTokens: Math.ceil(promptChars / 3.5),
      outputTokens: maxTokens,
    });
    expect(hold).toBeGreaterThanOrEqual(worstRealistic);
  });

  it('scales with the output ceiling, so a small call holds little', () => {
    expect(holdFor('claude-sonnet-4-6', 200, 64)).toBeLessThan(
      holdFor('claude-sonnet-4-6', 200, 16_000),
    );
  });
});

describe('hosted model allowlist', () => {
  it('matches the client list exactly', () => {
    // `api/` and `src/` are separate TS projects, so the list is duplicated.
    // This is the guard that keeps the copies honest — a model the settings
    // dropdown offers but the proxy refuses is a dead button.
    expect([...HOSTED_MODELS]).toEqual([...HOSTED_MODEL_IDS]);
  });

  it('keeps Opus off the owner’s key', () => {
    expect(isHostedModel('claude-opus-4-8')).toBe(false);
    expect(MODEL_PRICES['claude-opus-4-8']).toBeDefined();
  });

  it('prices every model it is willing to serve', () => {
    for (const model of HOSTED_MODELS) {
      expect(MODEL_PRICES[model]).toBeDefined();
    }
    expect(isHostedModel(DEFAULT_HOSTED_MODEL)).toBe(true);
  });

  it('rejects anything not on the list', () => {
    expect(isHostedModel('claude-sonnet-4-6')).toBe(true);
    expect(isHostedModel('gpt-4')).toBe(false);
    expect(isHostedModel(null)).toBe(false);
  });
});
