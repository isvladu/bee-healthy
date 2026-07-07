import { describe, expect, it } from 'vitest';
import type { GeneratedDietPlan } from '@/lib/llm/schemas/diet';
import {
  averageDailyCalories,
  toDietPlanDraft,
  type SourcePlan,
} from './planMapper';

const macros = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };

const generated: GeneratedDietPlan = {
  title: 'High-Protein Cut',
  summary: 'A balanced high-protein plan.',
  days: [
    {
      dayNumber: 1,
      meals: [
        {
          name: 'Breakfast',
          items: [{ name: 'Oats', quantity: 80, unit: 'g' }],
          macros: { kcal: 400, protein: 20, carbs: 60, fat: 8 },
        },
      ],
      totalMacros: macros,
    },
    {
      dayNumber: 2,
      meals: [
        {
          name: 'Breakfast',
          items: [{ name: 'Eggs', quantity: 3, unit: 'pieces' }],
          macros: { kcal: 300, protein: 18, carbs: 2, fat: 20 },
        },
      ],
      totalMacros: { kcal: 2100, protein: 160, carbs: 190, fat: 65 },
    },
  ],
};

describe('toDietPlanDraft', () => {
  it('assigns sequential calendar dates from the start date', () => {
    const draft = toDietPlanDraft({
      generated,
      startDate: '2026-07-07',
      durationDays: 2,
      goalPrompt: 'high protein',
    });
    expect(draft.durationDays).toBe(2);
    expect(draft.days.map((d) => d.date)).toEqual(['2026-07-07', '2026-07-08']);
    expect(draft.title).toBe('High-Protein Cut');
    expect(draft.summary).toBe('A balanced high-protein plan.');
    expect(draft.goalPrompt).toBe('high protein');
    expect(draft.days[0].meals[0].items[0].name).toBe('Oats');
  });

  it('tiles a short cycle to fill a longer duration', () => {
    const draft = toDietPlanDraft({
      generated, // 2-day cycle: [Oats, Eggs]
      startDate: '2026-07-07',
      durationDays: 5,
      goalPrompt: 'x',
    });
    expect(draft.durationDays).toBe(5);
    expect(draft.days.map((d) => d.date)).toEqual([
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
    ]);
    // Cycle repeats: day 3 == day 1, day 4 == day 2, day 5 == day 1.
    expect(draft.days[2].meals[0].items[0].name).toBe('Oats');
    expect(draft.days[3].meals[0].items[0].name).toBe('Eggs');
    expect(draft.days[4].meals[0].items[0].name).toBe('Oats');
  });

  it('produces no days when the cycle is empty', () => {
    const draft = toDietPlanDraft({
      generated: { title: 't', summary: 's', days: [] },
      startDate: '2026-07-07',
      durationDays: 10,
      goalPrompt: 'x',
    });
    expect(draft.days).toHaveLength(0);
    expect(draft.durationDays).toBe(0);
  });

  it('carries labels, notes, and optional (missing) macros from imported plans', () => {
    const source: SourcePlan = {
      title: 'Imported',
      days: [
        {
          label: 'Monday — Gym (AM)',
          note: 'Higher carbs.',
          meals: [
            {
              name: 'Post-gym',
              items: [{ name: 'Whey shake', quantity: 300, unit: 'ml' }],
              note: 'Right after training.',
            },
          ],
        },
      ],
    };
    const draft = toDietPlanDraft({
      generated: source,
      startDate: '2026-07-07',
      durationDays: 1,
      goalPrompt: 'x',
    });
    expect(draft.days[0].label).toBe('Monday — Gym (AM)');
    expect(draft.days[0].note).toBe('Higher carbs.');
    expect(draft.days[0].totalMacros).toBeUndefined();
    expect(draft.days[0].meals[0].macros).toBeUndefined();
    expect(draft.days[0].meals[0].note).toBe('Right after training.');
  });
});

describe('averageDailyCalories', () => {
  it('averages the per-day totals', () => {
    const draft = toDietPlanDraft({
      generated,
      startDate: '2026-07-07',
      durationDays: 2,
      goalPrompt: 'x',
    });
    expect(averageDailyCalories(draft)).toBe(2050);
  });

  it('returns 0 for an empty plan', () => {
    expect(averageDailyCalories({ days: [] })).toBe(0);
  });

  it('ignores days that have no totals', () => {
    expect(
      averageDailyCalories({
        days: [
          { date: '2026-07-07', meals: [], totalMacros: macros },
          { date: '2026-07-08', meals: [] },
        ],
      }),
    ).toBe(2000);
  });
});
