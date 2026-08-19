/**
 * Shared sanitizing for both telemetry channels (`reportError`, `logEvent`).
 *
 * The real defense against leaking user data is the per-channel *field
 * whitelist* — this module is what makes each whitelisted value safe to send:
 * primitives only, secrets redacted, everything length-capped.
 */

export const MAX_NAME_CHARS = 100;
export const MAX_MESSAGE_CHARS = 500;
export const MAX_STACK_CHARS = 4000;
export const MAX_EXTRA_KEYS = 10;
export const MAX_EXTRA_VALUE_CHARS = 500;

/**
 * Belt-and-braces redaction. The whitelists are the real defense — this catches
 * a secret that slipped into a message or stack frame. The server repeats it
 * (`api/log.ts`); keep the two in sync.
 */
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]+/g, // Anthropic API keys
  /sk-[A-Za-z0-9]{16,}/g, // other provider-style keys
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, // Authorization headers
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWTs (Supabase)
];

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((out, re) => out.replace(re, '[redacted]'), text);
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…[truncated]`;
}

/**
 * Reduce caller-supplied context to a flat map of short strings. Objects and
 * arrays collapse to their *type* — a nested value could be a diet plan or an
 * API response, so it is never serialized.
 */
export function sanitizeExtra(
  extra: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!extra) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(extra).slice(0, MAX_EXTRA_KEYS)) {
    if (value === undefined) continue;
    const text =
      typeof value === 'string'
        ? value
        : typeof value === 'number' ||
            typeof value === 'boolean' ||
            value === null
          ? String(value)
          : `[${typeof value}]`;
    out[key] = truncate(redactSecrets(text), MAX_EXTRA_VALUE_CHARS);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
