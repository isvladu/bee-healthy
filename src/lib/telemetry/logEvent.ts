/**
 * Structured application events — the non-error half of telemetry.
 *
 * `reportError` answers "what threw?". This answers "what did the app quietly
 * decide?": a fallback taken, a degraded mode entered, a parse that half-worked,
 * a sync conflict that discarded a local edit. Those are invisible today, and
 * they are usually the thing you actually need when a bug report arrives.
 *
 * Rules, same spirit as `reportError`:
 *  - **Metadata only.** Counts, enums, durations, booleans. Never health
 *    content, never user-authored text, never the API key. `fields` runs
 *    through the shared `sanitizeExtra`, so objects collapse to `[object]` —
 *    but that is the backstop, not the license. Pass numbers, not payloads.
 *  - **Never throw and never block.**
 *
 * Events are *batched* (unlike errors, which post immediately because the page
 * may be seconds from unloading). Naming convention: `category.subject.verb`,
 * lowercase and dotted — `sync.conflict.pending_overwritten`.
 */
import { sanitizeExtra, truncate, redactSecrets, MAX_NAME_CHARS } from './sanitize';
import {
  MAX_BODY_BYTES,
  byteLength,
  postTelemetry,
  transportEnabled,
} from './transport';

export type LogLevel = 'info' | 'warn';

export interface EventReport {
  level: LogLevel;
  /** The dotted event name — carried as `message` so the server whitelist fits. */
  message: string;
  where: string;
  route: string;
  appVersion: string;
  timestamp: string;
  extra?: Record<string, string>;
}

/**
 * A separate budget from `reportError`'s 20, so an event storm can never starve
 * error reporting.
 */
const MAX_EVENTS_PER_SESSION = 40;
/** Flush once the buffer reaches this many events… */
const FLUSH_AT = 10;
/** …or this long after the first buffered event, whichever comes first. */
const FLUSH_DEBOUNCE_MS = 5000;

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';

/** `sync.conflict.pending_overwritten` → `sync`. Mirrors an error's `where`. */
function categoryOf(event: string): string {
  const head = event.split('.')[0];
  return head || 'app';
}

/** Build the wire payload. Pure — the whitelist of fields lives here. */
export function buildEventReport(
  level: LogLevel,
  event: string,
  fields?: Record<string, unknown>,
): EventReport {
  const name = truncate(redactSecrets(event), MAX_NAME_CHARS);
  const report: EventReport = {
    level,
    message: name,
    where: categoryOf(name),
    route: typeof location === 'undefined' ? '' : location.pathname,
    appVersion: APP_VERSION,
    timestamp: new Date().toISOString(),
  };
  const extra = sanitizeExtra(fields);
  if (extra) report.extra = extra;
  return report;
}

let buffer: EventReport[] = [];
let queued = 0;
let capNoted = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let seen = new Set<string>();
let listenersInstalled = false;

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Send whatever is buffered. Safe to call at any time, including on unload. */
export function flushEvents(): void {
  clearTimer();
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    let body = JSON.stringify(batch);
    if (byteLength(body) > MAX_BODY_BYTES) {
      // Shed `extra` before dropping whole events — the names matter most.
      body = JSON.stringify(
        batch.map((event) => {
          const stripped = { ...event };
          delete stripped.extra;
          return stripped;
        }),
      );
    }
    void postTelemetry(body);
  } catch {
    // Telemetry must never break the app.
  }
}

/**
 * Flush on the two events that reliably precede a page going away. `pagehide`
 * covers the bfcache and mobile app-switch cases `unload` misses.
 */
function installFlushListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  window.addEventListener('pagehide', flushEvents);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushEvents();
  });
}

function enqueue(report: EventReport): void {
  installFlushListeners();
  buffer.push(report);
  if (buffer.length >= FLUSH_AT) {
    flushEvents();
    return;
  }
  if (timer === null) timer = setTimeout(flushEvents, FLUSH_DEBOUNCE_MS);
}

/**
 * Record an application event. Never throws, never blocks, never awaits.
 *
 * @param level `warn` for something that may need attention, `info` for the
 *   ordinary-but-notable. Both ship; the server routes them to distinct log
 *   streams so they can be filtered apart.
 */
export function logEvent(
  level: LogLevel,
  event: string,
  fields?: Record<string, unknown>,
): void {
  try {
    // Visible under `vite dev`, where nothing is shipped. Skipped under vitest,
    // which also reports DEV, to keep test output readable.
    if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
      const write = level === 'warn' ? console.warn : console.info;
      write(`[${level}] ${event}`, fields ?? '');
    }
    if (!transportEnabled()) return;
    if (queued >= MAX_EVENTS_PER_SESSION) {
      if (!capNoted) {
        capNoted = true;
        // Bypasses its own cap, so the log says *why* events stopped.
        enqueue(
          buildEventReport('warn', 'telemetry.event_cap_reached', {
            cap: MAX_EVENTS_PER_SESSION,
          }),
        );
        flushEvents();
      }
      return;
    }
    queued++;
    enqueue(buildEventReport(level, event, fields));
  } catch {
    // Telemetry must never break the app.
  }
}

/**
 * Like `logEvent`, but at most once per page load for a given event name. For
 * conditions that recur on every render or every sync cycle.
 */
export function logEventOnce(
  level: LogLevel,
  event: string,
  fields?: Record<string, unknown>,
): void {
  if (seen.has(event)) return;
  seen.add(event);
  logEvent(level, event, fields);
}

/** Test-only: clear the buffer, counters and dedupe set. */
export function resetEventLoggerForTests(): void {
  clearTimer();
  buffer = [];
  queued = 0;
  capNoted = false;
  seen = new Set<string>();
}
