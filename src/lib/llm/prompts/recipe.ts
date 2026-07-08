import { foodConstraintLines, type FoodConstraints } from './constraints';

export interface RecipeRequest extends FoodConstraints {
  request: string; // what to cook, e.g. "high-protein breakfast"
  servings?: number;
}

export const RECIPE_SYSTEM_PROMPT = [
  'You are a chef and dietitian. Create a single clear, realistic recipe.',
  'Use everyday ingredients and common measurements (g, ml, tbsp, tsp, pieces).',
  'Provide accurate macros per serving (kcal, protein, carbs, fat in grams).',
].join(' ');

export function buildRecipePrompt(req: RecipeRequest): string {
  const lines = [`Create a single recipe: ${req.request}.`];
  if (req.servings && req.servings > 0) {
    lines.push(`Make it for ${req.servings} servings.`);
  }
  lines.push(...foodConstraintLines(req));
  lines.push(
    'Include a short description, an ingredient list with quantities and units,',
    'clear numbered steps, the number of servings, and macros per serving.',
  );
  return lines.join('\n');
}

/** Copy-paste prompt for users generating in their own Claude/ChatGPT subscription. */
export function buildRecipeSubscriptionPrompt(req: RecipeRequest): string {
  const constraints = foodConstraintLines(req);
  const constraintBlock = constraints.length ? `\n${constraints.join('\n')}` : '';
  const servingsLine =
    req.servings && req.servings > 0 ? `\nMake it for ${req.servings} servings.` : '';

  return `You are a chef and dietitian. Create a single recipe: ${req.request}.${servingsLine}${constraintBlock}

Reply with ONLY a single JSON code block (\`\`\`json … \`\`\`) and no other text. Use exactly this shape:

\`\`\`json
{
  "title": "Scrambled Eggs with Spinach",
  "description": "High-protein breakfast scramble with a side of toast",
  "servings": 1,
  "ingredients": [
    { "name": "whole eggs", "quantity": 4, "unit": "pieces" },
    { "name": "fresh spinach", "quantity": 1, "unit": "cup" }
  ],
  "steps": [
    "Whisk the eggs and season with salt and pepper.",
    "Wilt the spinach in olive oil, then add the eggs and scramble until just set."
  ],
  "notes": "Best eaten right after your post-gym shake.",
  "macrosPerServing": { "kcal": 420, "protein": 32, "carbs": 18, "fat": 24 }
}
\`\`\`

Rules:
- Use realistic quantities and everyday units (g, ml, tbsp, tsp, pieces, slice).
- "macrosPerServing", "notes", and "description" are OPTIONAL — include them if you can, otherwise omit those fields.
- Output nothing outside the single JSON code block.`;
}
