// Structured-output schema for LLM-generated diet plans.
// Import from `zod/v4` so the types match the Anthropic SDK's zodOutputFormat helper.
// Keep it constraint-free (no .min/.max/.email) — those aren't part of the
// structured-outputs JSON Schema subset.
import { z } from 'zod/v4';

export const MacrosSchema = z.object({
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const GeneratedFoodItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
});

export const GeneratedMealSchema = z.object({
  name: z.string(),
  items: z.array(GeneratedFoodItemSchema),
  macros: MacrosSchema,
});

export const GeneratedDaySchema = z.object({
  dayNumber: z.number(),
  meals: z.array(GeneratedMealSchema),
  totalMacros: MacrosSchema,
});

export const GeneratedDietPlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  days: z.array(GeneratedDaySchema),
});

export type GeneratedDietPlan = z.infer<typeof GeneratedDietPlanSchema>;
