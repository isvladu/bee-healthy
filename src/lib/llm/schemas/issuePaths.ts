import type { ZodError } from 'zod/v4';

/** How many issue paths a failure report carries — enough to spot the pattern. */
const MAX_PATHS = 3;

/**
 * Summarize a validation failure as *field paths only* — `days.0.meals.1.name`.
 *
 * Imported text is the user's own diet or recipe content, so a validation
 * report must never carry the data itself. In particular `issue.message`
 * embeds the received value ("expected number, received \"two eggs\"") and is
 * therefore never emitted. Paths are structural and safe.
 */
export function issuePaths(error: ZodError): string {
  return error.issues
    .slice(0, MAX_PATHS)
    .map((issue) => (issue.path.length > 0 ? issue.path.join('.') : '(root)'))
    .join(', ');
}
