import { describe, expect, it } from 'vitest';
import type { DietPlan } from '@/lib/db/types';
import { buildShoppingList, categorize } from './buildShoppingList';

function makePlan(): DietPlan {
  return {
    id: 'p1',
    createdAt: '',
    updatedAt: '',
    syncStatus: 'pending',
    title: 'Test',
    startDate: '2026-07-07',
    durationDays: 2,
    days: [
      {
        date: '2026-07-07',
        meals: [
          {
            name: 'Lunch',
            items: [
              { name: 'Chicken breast', quantity: 200, unit: 'g' },
              { name: 'Rice', quantity: 100, unit: 'g' },
            ],
          },
        ],
      },
      {
        date: '2026-07-08',
        meals: [
          {
            name: 'Lunch',
            items: [
              { name: 'chicken breast', quantity: 200, unit: 'g' },
              { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
              { name: 'Sports drink' },
            ],
          },
        ],
      },
    ],
  };
}

describe('categorize', () => {
  it('classifies common foods', () => {
    expect(categorize('Chicken breast')).toBe('Meat & Fish');
    expect(categorize('Fresh spinach')).toBe('Produce');
    expect(categorize('Greek yogurt')).toBe('Dairy & Eggs');
    expect(categorize('Brown rice')).toBe('Grains & Bakery');
    expect(categorize('Olive oil')).toBe('Pantry');
    expect(categorize('Mystery item')).toBe('Other');
  });
});

describe('buildShoppingList', () => {
  it('merges identical items and sums quantities across the plan', () => {
    const list = buildShoppingList(makePlan());
    expect(list.dietPlanId).toBe('p1');

    const chicken = list.items.find((i) => i.name === 'Chicken breast');
    expect(chicken?.quantity).toBe(400); // 200 + 200
    expect(chicken?.category).toBe('Meat & Fish');

    // 4 distinct items: chicken, rice, olive oil, sports drink
    expect(list.items).toHaveLength(4);

    const drink = list.items.find((i) => i.name === 'Sports drink');
    expect(drink?.quantity).toBeUndefined();
    expect(drink?.checked).toBe(false);
  });
});
