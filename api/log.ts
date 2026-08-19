/**
 * `POST /api/log` — the sink for client error reports.
 *
 * This is the project's first server code. It is a pure logger: it validates
 * and scrubs the payload, then `console.error`s one JSON line so the report
 * lands in Vercel Runtime Logs. It holds no secrets and touches no database.
 *
 * The client (`src/lib/telemetry/reportError.ts`) is fire-and-forget, so this
 * endpoint answers fast and never returns something worth retrying.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Bounds abuse and cost. The client keeps its payload well under this. */
const MAX_BODY_BYTES = 10 * 1024;

/**
 * Backstop redaction — the client already whitelists fields, but a secret in a
 * stack frame must never reach the logs. Mirrors `redactSecrets` on the client.
 */
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]+/g, // Anthropic API keys
  /sk-[A-Za-z0-9]{16,}/g, // other provider-style keys
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, // Authorization headers
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWTs (Supabase)
];

export function scrubSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((out, re) => out.replace(re, '[redacted]'), text);
}

/** Fields we are willing to log, with a per-field character cap. */
const FIELD_LIMITS: Record<string, number> = {
  message: 1000,
  name: 100,
  stack: 6000,
  where: 60,
  route: 200,
  userAgent: 300,
  appVersion: 60,
  timestamp: 40,
};

const MAX_EXTRA_KEYS = 8;
const MAX_EXTRA_VALUE_CHARS = 300;

function clean(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  return scrubSecrets(value.length > limit ? value.slice(0, limit) : value);
}

/**
 * Best-effort same-origin check. Headers can be forged outside a browser, so
 * this stops casual cross-site spam rather than a determined attacker.
 *
 * Allowed: this deployment's own host, Vercel's generated URLs, and anything in
 * `ERROR_LOG_ALLOWED_ORIGINS` (comma-separated — set it for a custom domain).
 */
export function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
): boolean {
  if (!origin) return false;
  const allowed = new Set<string>();
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`); // localhost under `vercel dev`
  }
  for (const url of [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]) {
    if (url) allowed.add(`https://${url}`);
  }
  for (const extra of (process.env.ERROR_LOG_ALLOWED_ORIGINS ?? '').split(',')) {
    const trimmed = extra.trim();
    if (trimmed) allowed.add(trimmed);
  }
  return allowed.has(origin);
}

/** Whitelist + scrub the request body into the line we log. `null` = ignore. */
export function buildLogEntry(body: unknown): Record<string, unknown> | null {
  let input: unknown = body;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;

  const message = clean(record.message, FIELD_LIMITS.message);
  if (!message) return null;

  const entry: Record<string, unknown> = { level: 'error', source: 'client', message };
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    if (field === 'message') continue;
    const value = clean(record[field], limit);
    if (value) entry[field] = value;
  }

  const rawExtra = record.extra;
  if (rawExtra && typeof rawExtra === 'object' && !Array.isArray(rawExtra)) {
    const extra: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawExtra).slice(0, MAX_EXTRA_KEYS)) {
      const text = clean(String(value), MAX_EXTRA_VALUE_CHARS);
      if (text) extra[key.slice(0, 40)] = text;
    }
    if (Object.keys(extra).length > 0) entry.extra = extra;
  }

  return entry;
}

export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    res.status(405).end();
    return;
  }

  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    res.status(415).end();
    return;
  }

  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    res.status(413).end();
    return;
  }

  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
    res.status(403).end();
    return;
  }

  const entry = buildLogEntry(req.body);
  if (entry) console.error(JSON.stringify(entry));

  // Always 204, even for input we ignored — the client must never retry.
  res.status(204).end();
}
