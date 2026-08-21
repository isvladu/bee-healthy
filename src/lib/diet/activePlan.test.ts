import { describe, expect, it } from 'vitest';
import type { DietDay, DietPlan, Macros } from '@/lib/db/types';
import {
  averageDailyProtein,
  dayIndexForDate,
  dayTotals,
  formatFoodItem,
  macroSplit,
  mealEmoji,
  pickActivePlan,
  vsTargetNote,
} from './activePlan';

function day(date: string, totals?: Macros, meals: DietDay['meals'] = []): DietDay {
  return { date, meals, ...(totals ? { totalMacros: totals } : {}) };
}

function plan(id: string, startDate: string, days: DietDay[]): DietPlan {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    syncStatus: 'synced',
    title: id,
    startDate,
    durationDays: days.length,
    days,
  };
}

const macros: Macros = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };

describe('pickActivePlan', () => {
  const current = plan('current', '2026-08-17', [
    day('2026-08-17'),
    day('2026-08-18'),
    day('2026-08-19'),
  ]);
  const finished = plan('finished', '2026-01-01', [day('2026-01-01')]);
  const future = plan('future', '2026-12-01', [day('2026-12-01')]);

  it('returns null when there are no plans', () => {
    expect(pickActivePlan(undefined)).toBeNull();
    expect(pickActivePlan([])).toBeNull();
  });

  it('prefers the plan whose date range covers today over a newer one', () => {
    // `future` is first, as `listByCreatedDesc` would return the newest first.
    expect(pickActivePlan([future, current, finished], '2026-08-18')?.id).toBe(
      'current',
    );
  });

  it('falls back to the most recently created plan when none covers today', () => {
    expect(pickActivePlan([future, finished], '2026-08-18')?.id).toBe('future');
  });

  it('ignores a plan with no days even if its start date matches', () => {
    const empty = plan('empty', '2026-08-18', []);
    expect(pickActivePlan([empty, current], '2026-08-18')?.id).toBe('current');
  });
});

describe('dayIndexForDate', () => {
  const p = plan('p', '2026-08-17', [
    day('2026-08-17'),
    day('2026-08-18'),
    day('2026-08-19'),
  ]);

  it('finds the day matching the date', () => {
    expect(dayIndexForDate(p, '2026-08-19')).toBe(2);
  });

  it('falls back to the first day when the plan does not cover the date', () => {
    expect(dayIndexForDate(p, '2027-01-01')).toBe(0);
  });
});

describe('dayTotals', () => {
  it('prefers the stored totals', () => {
    expect(dayTotals(day('2026-08-18', macros))).toEqual(macros);
  });

  it('sums the meals when the day has no totals', () => {
    const summed = dayTotals(
      day('2026-08-18', undefined, [
        {
          name: 'Breakfast',
          items: [],
          macros: { kcal: 400, protein: 30, carbs: 40, fat: 10 },
        },
        {
          name: 'Lunch',
          items: [],
          macros: { kcal: 600, protein: 45, carbs: 55, fat: 15 },
        },
      ]),
    );
    expect(summed).toEqual({ kcal: 1000, protein: 75, carbs: 95, fat: 25 });
  });

  it('returns null when nothing carries macros, so the UI can hide instead of drawing zeros', () => {
    expect(
      dayTotals(day('2026-08-18', undefined, [{ name: 'Breakfast', items: [] }])),
    ).toBeNull();
  });
});

describe('macroSplit', () => {
  it('splits by energy, not by grams', () => {
    // 100g protein (400 kcal), 100g carbs (400), 100g fat (900) → 1700 kcal.
    const split = macroSplit({ kcal: 1700, protein: 100, carbs: 100, fat: 100 });
    expect(split).toEqual({ protein: 24, carbs: 24, fat: 53 });
  });

  it('is all zeros for null or empty macros', () => {
    expect(macroSplit(null)).toEqual({ protein: 0, carbs: 0, fat: 0 });
    expect(macroSplit({ kcal: 0, protein: 0, carbs: 0, fat: 0 })).toEqual({
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});

describe('averageDailyProtein', () => {
  it('averages only the days that report macros', () => {
    expect(
      averageDailyProtein({
        days: [
          day('2026-08-17', { ...macros, protein: 100 }),
          day('2026-08-18', { ...macros, protein: 200 }),
          day('2026-08-19'),
        ],
      }),
    ).toBe(150);
  });

  it('is zero when no day reports macros', () => {
    expect(averageDailyProtein({ days: [day('2026-08-17')] })).toBe(0);
  });
});

describe('vsTargetNote', () => {
  it('asks for a profile when there is no target', () => {
    expect(vsTargetNote(2000, null)).toMatch(/body stats/i);
  });

  it('calls out a deficit', () => {
    expect(vsTargetNote(1800, 2150)).toMatch(/350 kcal under target/);
  });

  it('calls out a surplus', () => {
    expect(vsTargetNote(2500, 2150)).toMatch(/350 kcal above/);
  });

  it('treats a near-miss as on target', () => {
    expect(vsTargetNote(2130, 2150)).toMatch(/Right on your/);
  });
});

describe('mealEmoji', () => {
  it('matches on the meal name', () => {
    expect(mealEmoji('Breakfast')).toBe('🥣');
    expect(mealEmoji('Post-workout snack')).toBe('🥤');
    expect(mealEmoji('Dinner — salmon')).toBe('🐟');
  });

  it('falls back for an unrecognised name', () => {
    expect(mealEmoji('Second elevenses')).toBe('🍽️');
  });
});

describe('formatFoodItem', () => {
  it('shows quantity and unit when present', () => {
    expect(formatFoodItem({ name: 'Chicken', quantity: 180.44, unit: 'g' })).toBe(
      'Chicken 180.4 g',
    );
  });

  it('shows just the name when there is no quantity', () => {
    expect(formatFoodItem({ name: 'Mixed greens' })).toBe('Mixed greens');
  });
});
