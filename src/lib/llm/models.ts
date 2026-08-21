export interface ModelOption {
  id: string;
  label: string;
  hint: string;
  /** Available through the hosted proxy, not just with the user's own key. */
  hosted: boolean;
}

// Selectable Claude models. Default is Sonnet 4.6 — cost-effective for the routine
// parsing/macro work; Opus 4.8 is available for heavier multi-week planning.
export const ANTHROPIC_MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    hint: 'Balanced — recommended default',
    hosted: true,
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    hint: 'Most capable — best for complex plans',
    hosted: false,
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    hint: 'Fastest & cheapest',
    hosted: true,
  },
];

/**
 * Models the hosted proxy will run on the owner's key. Opus is missing on
 * purpose — at 5× Sonnet's output price a single multi-week plan could swallow a
 * whole monthly grant, and anyone who wants it can bring their own key.
 *
 * Mirrors `HOSTED_MODELS` in `api/_lib/pricing.ts`; the two are separate
 * TypeScript projects, so `api/_lib/pricing.test.ts` asserts they match.
 */
export const HOSTED_MODEL_IDS = ANTHROPIC_MODELS.filter((m) => m.hosted).map(
  (m) => m.id,
);

export const DEFAULT_HOSTED_MODEL = 'claude-sonnet-4-6';

export function isHostedModel(value: unknown): value is string {
  return typeof value === 'string' && HOSTED_MODEL_IDS.includes(value);
}
