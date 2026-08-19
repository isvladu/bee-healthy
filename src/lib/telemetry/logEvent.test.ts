import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEventReport,
  flushEvents,
  logEvent,
  logEventOnce,
  resetEventLoggerForTests,
} from './logEvent';
import { resetErrorReporterForTests } from './reportError';

/** Everything an event payload is ever allowed to contain. */
const ALLOWED_KEYS = [
  'level',
  'message',
  'where',
  'route',
  'appVersion',
  'timestamp',
  'extra',
];

describe('buildEventReport', () => {
  it('emits only whitelisted keys', () => {
    const report = buildEventReport('info', 'sync.completed', { pushed: 3 });
    expect(Object.keys(report).every((k) => ALLOWED_KEYS.includes(k))).toBe(true);
    expect(report.level).toBe('info');
    expect(report.message).toBe('sync.completed');
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('derives `where` from the first segment of the event name', () => {
    expect(buildEventReport('warn', 'sync.conflict.pending_overwritten').where).toBe(
      'sync',
    );
    expect(buildEventReport('info', 'llm.call.completed').where).toBe('llm');
    expect(buildEventReport('info', 'nodots').where).toBe('nodots');
  });

  it('carries no stack, name or userAgent', () => {
    const report = buildEventReport('info', 'app.start');
    expect(report).not.toHaveProperty('stack');
    expect(report).not.toHaveProperty('name');
    expect(report).not.toHaveProperty('userAgent');
  });

  it('never includes app data passed as a field', () => {
    const report = buildEventReport('warn', 'import.diet.validation_failed', {
      plan: { title: 'Cut', days: [{ meals: ['omelette'] }] },
      apiKey: 'sk-ant-api03-secret-key-value',
      weightKg: 81,
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('omelette');
    expect(serialized).not.toContain('Cut');
    expect(serialized).not.toContain('sk-ant-');
    expect(report.extra).toMatchObject({ plan: '[object]', apiKey: '[redacted]' });
  });

  it('redacts secrets that reach the event name itself', () => {
    const report = buildEventReport('warn', 'llm.key.sk-ant-api03-LEAKED_VALUE');
    expect(report.message).not.toContain('LEAKED_VALUE');
  });
});

describe('logEvent', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

  beforeEach(() => {
    vi.useFakeTimers();
    resetEventLoggerForTests();
    resetErrorReporterForTests();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    // Tests run with import.meta.env.DEV true; opt in the way `vercel dev` does.
    vi.stubEnv('VITE_ERROR_REPORTING', 'on');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function lastBatch(): unknown[] {
    const [, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
    return JSON.parse(init.body as string) as unknown[];
  }

  it('buffers rather than posting one request per event', () => {
    for (let i = 0; i < 9; i++) logEvent('info', `app.tick_${i}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flushes a batch as a JSON array once the buffer fills', () => {
    for (let i = 0; i < 10; i++) logEvent('info', `app.tick_${i}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/log');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    const batch = lastBatch();
    expect(Array.isArray(batch)).toBe(true);
    expect(batch).toHaveLength(10);
  });

  it('flushes a partial buffer after the debounce', () => {
    logEvent('warn', 'sync.remote_row.unknown_table', { type: 'ghost' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastBatch()).toHaveLength(1);
  });

  it('flushes when the page is hidden', () => {
    logEvent('info', 'app.start');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flushes on pagehide', () => {
    logEvent('info', 'app.start');
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when telemetry is switched off', () => {
    vi.stubEnv('VITE_ERROR_REPORTING', 'off');
    logEvent('info', 'app.start');
    flushEvents();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caps events per session and says why it stopped', () => {
    for (let i = 0; i < 100; i++) logEvent('info', `app.tick_${i}`);
    flushEvents();
    const names = fetchMock.mock.calls.flatMap((call) => {
      const [, init] = call as unknown as [string, RequestInit];
      return (JSON.parse(init.body as string) as { message: string }[]).map(
        (e) => e.message,
      );
    });
    // 40 real events plus the one notice explaining the cap.
    expect(names).toHaveLength(41);
    expect(names.filter((n) => n === 'telemetry.event_cap_reached')).toHaveLength(1);
  });

  it('swallows a failing transport', () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(() => {
      logEvent('info', 'app.start');
      flushEvents();
    }).not.toThrow();
  });

  it('logs to the console under dev even when nothing ships', () => {
    vi.stubEnv('VITE_ERROR_REPORTING', 'off');
    vi.stubEnv('MODE', 'development');
    logEvent('warn', 'net.offline');
    logEvent('info', 'app.start');
    expect(console.warn).toHaveBeenCalled();
    expect(console.info).toHaveBeenCalled();
  });
});

describe('logEventOnce', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

  beforeEach(() => {
    resetEventLoggerForTests();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_ERROR_REPORTING', 'on');
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('emits a given event name at most once per page load', () => {
    for (let i = 0; i < 5; i++) {
      logEventOnce('info', 'sync.skipped.unconfigured');
      logEventOnce('info', 'workout.calories.default_weight');
    }
    flushEvents();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const batch = JSON.parse(init.body as string) as { message: string }[];
    expect(batch.map((e) => e.message).sort()).toEqual([
      'sync.skipped.unconfigured',
      'workout.calories.default_weight',
    ]);
  });
});
