// Lenient schema for diet plans pasted in from a Claude/ChatGPT subscription.
// This is validated CLIENT-SIDE (never sent to the API), so — unlike the API
// structured-output schema — it may use optional fields, defaults, etc.
import { z } from 'zod/v4';

const MacrosSchema = z.object({
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

const ItemSchema = z.object({
  name: z.string(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
});

const MealSchema = z.object({
  name: z.string(),
  items: z.array(ItemSchema).default([]),
  macros: MacrosSchema.optional(),
  note: z.string().optional(),
});

const DaySchema = z.object({
  label: z.string().optional(),
  meals: z.array(MealSchema),
  totalMacros: MacrosSchema.optional(),
  note: z.string().optional(),
});

export const ImportedDietPlanSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  days: z.array(DaySchema),
});

export type ImportedDietPlan = z.infer<typeof ImportedDietPlanSchema>;

/** Pull a JSON object out of pasted text — handles ```json fences and surrounding prose. */
export function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in the pasted text.');
  }
  return candidate.slice(start, end + 1);
}

/** Parse + validate pasted subscription output into a diet plan. Throws on failure. */
export function parseImportedDietPlan(text: string): ImportedDietPlan {
  const raw = extractJsonBlock(text);

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(
      "That doesn't look like valid JSON. Paste the whole JSON block from your assistant.",
    );
  }

  const result = ImportedDietPlanSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      "The JSON didn't match the expected diet format. Make sure you copied the full reply.",
    );
  }
  if (result.data.days.length === 0) {
    throw new Error('The plan has no days.');
  }
  return result.data;
}
