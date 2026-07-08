import { describe, expect, it } from 'vitest';
import { toRecipeDraft } from './recipeMapper';

describe('toRecipeDraft', () => {
  it('defaults servings to 1 and tags to [] for a minimal imported recipe', () => {
    const draft = toRecipeDraft(
      {
        title: 'Scramble',
        ingredients: [{ name: 'Eggs', quantity: 4, unit: 'pieces' }],
        steps: ['Whisk and cook.'],
      },
      'Imported',
    );
    expect(draft.servings).toBe(1);
    expect(draft.tags).toEqual([]);
    expect(draft.source).toBe('Imported');
    expect(draft.macrosPerServing).toBeUndefined();
    expect(draft.ingredients[0].name).toBe('Eggs');
  });

  it('keeps provided servings, tags, and macros', () => {
    const draft = toRecipeDraft(
      {
        title: 'Bowl',
        servings: 2,
        ingredients: [],
        steps: [],
        macrosPerServing: { kcal: 500, protein: 40, carbs: 45, fat: 15 },
        tags: ['lunch'],
      },
      'Claude (API)',
    );
    expect(draft.servings).toBe(2);
    expect(draft.tags).toEqual(['lunch']);
    expect(draft.macrosPerServing?.kcal).toBe(500);
  });
});
