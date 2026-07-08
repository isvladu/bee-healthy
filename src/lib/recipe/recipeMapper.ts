import type { Macros, Recipe } from '@/lib/db/types';

export type RecipeDraft = Omit<
  Recipe,
  'id' | 'createdAt' | 'updatedAt' | 'syncStatus'
>;

// A lenient shape that both the generated (macros required) and imported (macros
// optional) recipes satisfy.
export interface RecipeSource {
  title: string;
  description?: string;
  servings?: number;
  ingredients: { name: string; quantity?: number; unit?: string }[];
  steps: string[];
  macrosPerServing?: Macros;
  notes?: string;
  tags?: string[];
}

/** Normalize a generated or imported recipe into a persistable Recipe. */
export function toRecipeDraft(source: RecipeSource, origin: string): RecipeDraft {
  return {
    title: source.title,
    description: source.description,
    ingredients: source.ingredients.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
    })),
    steps: source.steps,
    servings: source.servings && source.servings > 0 ? source.servings : 1,
    macrosPerServing: source.macrosPerServing,
    notes: source.notes,
    tags: source.tags ?? [],
    source: origin,
  };
}
