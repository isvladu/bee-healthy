import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logEvent } from '@/lib/telemetry/logEvent';
import { parseImportedRecipe } from './recipeImport';

vi.mock('@/lib/telemetry/logEvent', () => ({
  logEvent: vi.fn(),
  logEventOnce: vi.fn(),
}));

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

describe('parseImportedRecipe failure reporting', () => {
  beforeEach(() => vi.mocked(logEvent).mockClear());

  it.each([
    ['no JSON object at all', 'sorry, no recipe', 'extract'],
    ['braces but unparseable', '{ this is not json }', 'json'],
    ['valid but empty', '{"title":"x","ingredients":[],"steps":[]}', 'empty'],
  ])('reports stage %s', (_label, input, stage) => {
    expect(() => parseImportedRecipe(input)).toThrow();
    const call = vi
      .mocked(logEvent)
      .mock.calls.find(([, event]) => event === 'import.recipe.validation_failed');
    expect((call?.[2] as { stage: string }).stage).toBe(stage);
  });
});
