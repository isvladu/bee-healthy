import { describe, expect, it } from 'vitest';
import { extractJsonBlock, parseImportedDietPlan } from './dietImport';

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
