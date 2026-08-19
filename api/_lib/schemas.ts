/**
 * Request validation for the `/api` tier (§5.7 — zod on every endpoint).
 *
 * These are ordinary client-side-style zod schemas with the full feature set:
 * unlike the LLM structured-output schemas in `src/lib/llm/schemas/`, nothing
 * here is ever sent to Anthropic, so `.min()`/`.email()` are fine.
 */
import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password.js';
import { SYNCABLE_TYPES } from './data.js';

const email = z.string().trim().toLowerCase().email().max(254);

/**
 * A length floor and nothing else. Composition rules ("one digit, one symbol")
 * push users toward predictable substitutions; length is what actually costs an
 * attacker. The ceiling exists so nobody can hand the hasher a megabyte.
 */
const password = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

export const credentialsSchema = z.object({ email, password });

export const emailOnlySchema = z.object({ email });

export const verifySchema = z.object({ token: z.string().min(1).max(200) });

export const resetSchema = z.object({
  token: z.string().min(1).max(200),
  password,
});

/**
 * One record in a sync push. `data` is opaque JSON — it is the user's own diet
 * and workout content, which the server stores but never interprets. The
 * server strips device-only fields from it (`stripDeviceOnlyFields`) rather
 * than validating its shape.
 */
export const syncRecordSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(SYNCABLE_TYPES),
  updatedAt: z.string().datetime(),
  deleted: z.boolean().default(false),
  data: z.record(z.string(), z.unknown()).default({}),
});

/** Bounds one request; the client chunks anything larger. */
export const MAX_PUSH_RECORDS = 200;

export const syncPushSchema = z.object({
  records: z.array(syncRecordSchema).max(MAX_PUSH_RECORDS),
});

/** Field paths only — never `issue.message`, which embeds the received value. */
export function issuePaths(error: z.ZodError): string {
  return error.issues
    .map((issue) => issue.path.join('.') || '(root)')
    .slice(0, 10)
    .join(',');
}
