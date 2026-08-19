// Lenient schema for a recipe pasted in from a Claude/ChatGPT subscription.
// Validated client-side, so full zod (optionals, defaults) is fine.
import { z } from 'zod/v4';
import { logEvent } from '@/lib/telemetry/logEvent';
import { extractJsonBlock } from './dietImport';
import { issuePaths } from './issuePaths';

const MacrosSchema = z.object({
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
});

export const ImportedRecipeSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  servings: z.number().optional(),
  ingredients: z.array(IngredientSchema).default([]),
  steps: z.array(z.string()).default([]),
  macrosPerServing: MacrosSchema.optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type ImportedRecipe = z.infer<typeof ImportedRecipeSchema>;

/** Parse + validate pasted subscription output into a recipe. Throws on failure. */
export function parseImportedRecipe(text: string): ImportedRecipe {
  const raw = extractJsonBlock(text);

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    logEvent('warn', 'import.recipe.validation_failed', { stage: 'json' });
    throw new Error(
      "That doesn't look like valid JSON. Paste the whole JSON block from your assistant.",
    );
  }

  const result = ImportedRecipeSchema.safeParse(json);
  if (!result.success) {
    // Paths only — see `issuePaths`. Never the offending values.
    logEvent('warn', 'import.recipe.validation_failed', {
      stage: 'schema',
      issueCount: result.error.issues.length,
      issuePaths: issuePaths(result.error),
    });
    throw new Error(
      "The JSON didn't match the expected recipe format. Make sure you copied the full reply.",
    );
  }
  if (result.data.ingredients.length === 0 && result.data.steps.length === 0) {
    logEvent('warn', 'import.recipe.validation_failed', { stage: 'empty' });
    throw new Error('The recipe has no ingredients or steps.');
  }
  // One half present and the other empty still imports — worth knowing.
  if (result.data.ingredients.length === 0 || result.data.steps.length === 0) {
    logEvent('info', 'import.recipe.partial', {
      ingredients: result.data.ingredients.length,
      steps: result.data.steps.length,
    });
  }
  return result.data;
}
