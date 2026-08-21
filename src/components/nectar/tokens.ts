/** Non-component helpers for the Nectar UI. Kept out of `primitives.tsx` so
 *  that file only exports components and Fast Refresh keeps working. */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Handoff §"Macro color mapping": protein sage, carbs honey, fat terra. */
export const MACRO_COLORS = {
  protein: 'var(--sage)',
  carbs: 'var(--honey)',
  fat: 'var(--terra)',
} as const;
