import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logEvent } from '@/lib/telemetry/logEvent';
import { extractJsonBlock, parseImportedDietPlan } from './dietImport';

vi.mock('@/lib/telemetry/logEvent', () => ({
  logEvent: vi.fn(),
  logEventOnce: vi.fn(),
}));

/** The `stage` of every `import.diet.validation_failed` emitted so far. */
function stages(): string[] {
  return vi
    .mocked(logEvent)
    .mock.calls.filter(([, event]) => event === 'import.diet.validation_failed')
    .map(([, , fields]) => (fields as { stage: string }).stage);
}

const planJson = {
  title: 'Training Week',
  summary: 'Gym-aware plan.',
  days: [
    {
      label: 'Monday — Gym (AM)',
      note: 'Higher carbs.',
      meals: [
        {
          name: 'Post-gym',
          items: [{ name: 'Whey + milk shake', quantity: 300, unit: 'ml' }],
          note: 'Right after training.',
        },
        {
          name: 'Breakfast',
          items: [{ name: 'Eggs', quantity: 3, unit: 'pieces' }],
          macros: { kcal: 220, protein: 18, carbs: 2, fat: 15 },
        },
      ],
    },
  ],
};

describe('extractJsonBlock', () => {
  it('pulls JSON out of a fenced code block', () => {
    const text = 'Here you go:\n```json\n{"a":1}\n```\nEnjoy!';
    expect(extractJsonBlock(text)).toBe('{"a":1}');
  });

  it('finds a bare JSON object amid prose', () => {
    expect(extractJsonBlock('blah { "a": 1 } blah')).toBe('{ "a": 1 }');
  });

  it('throws when no object is present', () => {
    expect(() => extractJsonBlock('no json here')).toThrow();
  });
});

describe('parseImportedDietPlan', () => {
  it('parses a fenced plan and preserves optional fields', () => {
    const text = '```json\n' + JSON.stringify(planJson) + '\n```';
    const plan = parseImportedDietPlan(text);
    expect(plan.title).toBe('Training Week');
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].label).toBe('Monday — Gym (AM)');
    // First meal has no macros — that's allowed.
    expect(plan.days[0].meals[0].macros).toBeUndefined();
    expect(plan.days[0].meals[1].macros?.kcal).toBe(220);
  });

  it('rejects text without JSON', () => {
    expect(() => parseImportedDietPlan('sorry, no plan')).toThrow();
  });

  it('rejects JSON that does not match the shape', () => {
    expect(() => parseImportedDietPlan('{"foo": "bar"}')).toThrow();
  });

  it('rejects a plan with no days', () => {
    expect(() =>
      parseImportedDietPlan('{"title":"x","days":[]}'),
    ).toThrow(/no days/i);
  });
});

describe('parseImportedDietPlan failure reporting', () => {
  beforeEach(() => vi.mocked(logEvent).mockClear());

  // Every way an import can fail must be distinguishable in the logs — this is
  // the first question asked when a user says "the import didn't work".
  it.each([
    ['no JSON object at all', 'sorry, no plan', 'extract'],
    ['braces but unparseable', '{ this is not json }', 'json'],
    ['parses but wrong shape', '{"foo":"bar"}', 'schema'],
    ['valid but empty', '{"title":"x","days":[]}', 'empty'],
  ])('reports stage %s', (_label, input, stage) => {
    expect(() => parseImportedDietPlan(input)).toThrow();
    expect(stages()).toEqual([stage]);
  });

  it('reports nothing when the import succeeds', () => {
    parseImportedDietPlan(JSON.stringify(planJson));
    expect(stages()).toEqual([]);
  });

  it('carries issue paths but never the pasted content', () => {
    const pasted =
      '{"title":"Cut","days":[{"meals":[{"name":"secret omelette","items":"nope"}]}]}';
    expect(() => parseImportedDietPlan(pasted)).toThrow();
    const fields = vi.mocked(logEvent).mock.calls[0][2] as Record<string, unknown>;
    expect(fields.issuePaths).toBe('days.0.meals.0.items');
    expect(JSON.stringify(fields)).not.toContain('omelette');
  });
});
