/**
 * Client error reporting.
 *
 * Fire-and-forget POSTs error *metadata* to `/api/log` (a Vercel serverless
 * function) so failures in the wild land in the runtime logs instead of
 * vanishing on the user's device.
 *
 * Non-negotiable rules:
 *  - **Never send app data.** No diet plans, recipes, workouts, body metrics or
 *    profile fields, and never the LLM API key. The payload is a fixed
 *    whitelist built in `buildErrorReport` — extend it only with metadata.
 *  - **Never throw and never block.** Telemetry failing must be invisible to
 *    the user, so every path here swallows its own errors.
 */

const ENDPOINT = '/api/log';

/** Stop after this many reports per page load, so an error loop can't flood. */
const MAX_REPORTS_PER_SESSION = 20;

const MAX_NAME_CHARS = 100;
const MAX_MESSAGE_CHARS = 500;
const MAX_STACK_CHARS = 4000;
const MAX_EXTRA_KEYS = 10;
const MAX_EXTRA_VALUE_CHARS = 500;

/** Keep the serialized body comfortably under the server's 10 KB cap. */
const MAX_BODY_BYTES = 9000;

/**
 * Belt-and-braces redaction. The whitelist above is the real defense — this
 * catches a secret that slipped into a message or stack frame. The server
 * repeats it (`api/log.ts`); keep the two in sync.
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

export interface ReportContext {
  /** Short tag for the failing area, e.g. `llm`, `sync`, `auth`, `react`. */
  where?: string;
  /** Extra *metadata* only — primitives are stringified, objects are dropped. */
  extra?: Record<string, unknown>;
}

export interface ErrorReport {
  message: string;
  name: string;
  stack?: string;
  where: string;
  route: string;
  userAgent: string;
  appVersion: string;
  timestamp: string;
  extra?: Record<string, string>;
}

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…[truncated]`;
}

/**
 * Reduce an unknown throwable to name/message/stack. Arbitrary objects are
 * *not* serialized — a rejected value could be an API response carrying user
 * data, so we record only its type.
 */
function describe(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Error with no message',
      stack: error.stack,
    };
  }
  if (typeof error === 'string') return { name: 'Thrown', message: error };
  if (typeof error === 'number' || typeof error === 'boolean') {
    return { name: 'Thrown', message: String(error) };
  }
  return { name: 'Thrown', message: `Non-Error value of type ${typeof error}` };
}

function sanitizeExtra(
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

/** Build the wire payload. Pure — the whitelist of fields lives here. */
export function buildErrorReport(
  error: unknown,
  context: ReportContext = {},
): ErrorReport {
  const { name, message, stack } = describe(error);
  const report: ErrorReport = {
    message: truncate(redactSecrets(message), MAX_MESSAGE_CHARS),
    name: truncate(redactSecrets(name), MAX_NAME_CHARS),
    where: context.where ?? 'unknown',
    route: typeof location === 'undefined' ? '' : location.pathname,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    appVersion: APP_VERSION,
    timestamp: new Date().toISOString(),
  };
  if (stack) report.stack = truncate(redactSecrets(stack), MAX_STACK_CHARS);
  const extra = sanitizeExtra(context.extra);
  if (extra) report.extra = extra;
  return report;
}

let sent = 0;
let disabled = false;

function reportingEnabled(): boolean {
  if (disabled || sent >= MAX_REPORTS_PER_SESSION) return false;
  if (typeof fetch !== 'function') return false;
  const flag = import.meta.env.VITE_ERROR_REPORTING as string | undefined;
  if (flag === 'off') return false;
  // `vite dev` serves no `/api` tier, so reporting would only log 404s. Set
  // VITE_ERROR_REPORTING=on to exercise the endpoint under `vercel dev`.
  if (import.meta.env.DEV && flag !== 'on') return false;
  return true;
}

function byteLength(text: string): number {
  return typeof TextEncoder === 'undefined'
    ? text.length
    : new TextEncoder().encode(text).length;
}

async function send(report: ErrorReport): Promise<void> {
  try {
    let body = JSON.stringify(report);
    if (byteLength(body) > MAX_BODY_BYTES) {
      // Shed the optional parts rather than have the server reject the whole
      // report — the message and `where` tag are what we actually need.
      const trimmed = { ...report, stack: report.stack?.slice(0, 2000) };
      delete trimmed.extra;
      body = JSON.stringify(trimmed);
    }
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      // Survive the page unload that often follows a fatal error.
      keepalive: true,
    });
    // Deployed to a plain static host with no `/api` tier — stop trying.
    if (res.status === 404 || res.status === 405) disabled = true;
  } catch {
    // Offline, blocked by an extension, CSP — drop it silently.
  }
}

/**
 * Report an error. Safe to call from any catch block; it never throws, never
 * returns a rejected promise, and never delays the caller.
 */
export function reportError(error: unknown, context: ReportContext = {}): void {
  try {
    if (!reportingEnabled()) return;
    sent++;
    void send(buildErrorReport(error, context));
  } catch {
    // Telemetry must never break the app.
  }
}

let handlersInstalled = false;

/** Route uncaught errors and unhandled rejections to `reportError`. Idempotent. */
export function installGlobalErrorHandlers(): void {
  if (handlersInstalled || typeof window === 'undefined') return;
  handlersInstalled = true;

  window.addEventListener('error', (event) => {
    // Cross-origin script errors are opaque ("Script error.", no stack) — noise.
    if (!event.error && event.message === 'Script error.') return;
    reportError(event.error ?? event.message, {
      where: 'window.onerror',
      extra: { source: event.filename, line: event.lineno, column: event.colno },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, { where: 'unhandledrejection' });
  });
}

/** Test-only: clear the per-session counters. */
export function resetErrorReporterForTests(): void {
  sent = 0;
  disabled = false;
}
