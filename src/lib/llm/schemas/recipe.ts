// API structured-output schema for a generated recipe. Constraint-free (sent to
// the Anthropic API via output_config.format), so no optionals / no .min/.max.
import { z } from 'zod/v4';

const MacrosSchema = z.object({
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
});

export const GeneratedRecipeSchema = z.object({
  title: z.string(),
  description: z.string(),
  servings: z.number(),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()),
  macrosPerServing: MacrosSchema,
});

export type GeneratedRecipe = z.infer<typeof GeneratedRecipeSchema>;
