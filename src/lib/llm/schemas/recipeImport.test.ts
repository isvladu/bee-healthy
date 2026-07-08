import { describe, expect, it } from 'vitest';
import { parseImportedRecipe } from './recipeImport';

const recipe = {
  title: 'Scrambled Eggs with Spinach',
  description: 'High-protein breakfast.',
  servings: 1,
  ingredients: [
    { name: 'whole eggs', quantity: 4, unit: 'pieces' },
    { name: 'fresh spinach', quantity: 1, unit: 'cup' },
  ],
  steps: ['Whisk the eggs.', 'Wilt the spinach, then scramble.'],
  notes: 'Best right after a workout.',
};

describe('parseImportedRecipe', () => {
  it('parses a fenced recipe and keeps optional fields', () => {
    const parsed = parseImportedRecipe('```json\n' + JSON.stringify(recipe) + '\n```');
    expect(parsed.title).toBe('Scrambled Eggs with Spinach');
    expect(parsed.ingredients).toHaveLength(2);
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.notes).toContain('workout');
    // macros omitted → undefined, allowed
    expect(parsed.macrosPerServing).toBeUndefined();
  });

  it('rejects text without JSON', () => {
    expect(() => parseImportedRecipe('no recipe here')).toThrow();
  });

  it('rejects a recipe with no ingredients or steps', () => {
    expect(() =>
      parseImportedRecipe('{"title":"x","ingredients":[],"steps":[]}'),
    ).toThrow(/no ingredients or steps/i);
  });
});
