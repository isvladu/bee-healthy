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
 *
 * For non-failure signals (fallbacks taken, degraded modes, parse quality) use
 * `logEvent` instead — it batches, and it has its own budget so an event storm
 * can never starve error reporting.
 */
import {
  MAX_MESSAGE_CHARS,
  MAX_NAME_CHARS,
  MAX_STACK_CHARS,
  redactSecrets,
  sanitizeExtra,
  truncate,
} from './sanitize';
import { logEvent } from './logEvent';
import {
  MAX_BODY_BYTES,
  byteLength,
  postTelemetry,
  resetTransportForTests,
  transportEnabled,
} from './transport';

export { redactSecrets };

/** Stop after this many reports per page load, so an error loop can't flood. */
const MAX_REPORTS_PER_SESSION = 20;

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

function reportingEnabled(): boolean {
  if (sent >= MAX_REPORTS_PER_SESSION) return false;
  return transportEnabled();
}

function send(report: ErrorReport): void {
  let body = JSON.stringify({ level: 'error', ...report });
  if (byteLength(body) > MAX_BODY_BYTES) {
    // Shed the optional parts rather than have the server reject the whole
    // report — the message and `where` tag are what we actually need.
    const trimmed = { ...report, stack: report.stack?.slice(0, 2000) };
    delete trimmed.extra;
    body = JSON.stringify({ level: 'error', ...trimmed });
  }
  void postTelemetry(body);
}

/**
 * Report an error. Safe to call from any catch block; it never throws, never
 * returns a rejected promise, and never delays the caller.
 */
export function reportError(error: unknown, context: ReportContext = {}): void {
  try {
    if (!reportingEnabled()) return;
    sent++;
    send(buildErrorReport(error, context));
    if (sent === MAX_REPORTS_PER_SESSION) {
      // The observability system going dark should itself be observable.
      logEvent('warn', 'telemetry.error_cap_reached', {
        cap: MAX_REPORTS_PER_SESSION,
      });
    }
  } catch {
    // Telemetry must never break the app.
  }
}

/** A dynamic-import failure after a deploy, usually a stale service worker. */
function isChunkLoadFailure(error: unknown, message: string): boolean {
  const text = error instanceof Error ? error.message : message;
  return (
    /dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text) ||
    /ChunkLoadError/i.test(text)
  );
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
      extra: {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        ...(isChunkLoadFailure(event.error, event.message)
          ? { kind: 'chunk_load' }
          : {}),
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, { where: 'unhandledrejection' });
  });

  let offlineSince: number | null = null;
  window.addEventListener('offline', () => {
    offlineSince = Date.now();
    logEvent('warn', 'net.offline');
  });
  window.addEventListener('online', () => {
    logEvent('info', 'net.online', {
      downMs: offlineSince === null ? undefined : Date.now() - offlineSince,
    });
    offlineSince = null;
  });
}

/** Test-only: clear the per-session counters. */
export function resetErrorReporterForTests(): void {
  sent = 0;
  handlersInstalled = false;
  resetTransportForTests();
}
