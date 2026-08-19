import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildErrorReport,
  redactSecrets,
  reportError,
  resetErrorReporterForTests,
} from './reportError';

/** Everything the payload is ever allowed to contain. */
const ALLOWED_KEYS = [
  'message',
  'name',
  'stack',
  'where',
  'route',
  'userAgent',
  'appVersion',
  'timestamp',
  'extra',
];

describe('redactSecrets', () => {
  it('redacts Anthropic keys, bearer tokens and JWTs', () => {
    const text = [
      'key sk-ant-api03-AbCdEf_012-xyz failed',
      'Authorization: Bearer abc123.def-456',
      'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.Zm9vYmFy',
    ].join(' | ');
    const out = redactSecrets(text);
    expect(out).not.toMatch(/sk-ant-/);
    expect(out).not.toMatch(/abc123\.def-456/);
    expect(out).not.toMatch(/eyJhbGciOiJIUzI1NiJ9/);
    expect(out).toContain('[redacted]');
  });

  it('leaves ordinary text alone', () => {
    expect(redactSecrets('Failed to fetch diet plan')).toBe(
      'Failed to fetch diet plan',
    );
  });
});

describe('buildErrorReport', () => {
  it('emits only whitelisted keys', () => {
    const report = buildErrorReport(new Error('boom'), { where: 'llm' });
    expect(Object.keys(report).every((k) => ALLOWED_KEYS.includes(k))).toBe(true);
    expect(report.message).toBe('boom');
    expect(report.name).toBe('Error');
    expect(report.where).toBe('llm');
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('never includes app data hung off the error object', () => {
    const err = Object.assign(new Error('save failed'), {
      dietPlan: { title: 'Cut', days: [{ meals: ['omelette'] }] },
      apiKey: 'sk-ant-api03-secret-key-value',
    });
    const report = buildErrorReport(err, { where: 'sync' });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('dietPlan');
    expect(serialized).not.toContain('omelette');
    expect(serialized).not.toContain('sk-ant-');
  });

  it('scrubs secrets out of the message and stack', () => {
    const err = new Error('Invalid key sk-ant-api03-LEAKED_VALUE_1234');
    err.stack = 'Error: sk-ant-api03-LEAKED_VALUE_1234\n  at foo (app.js:1:1)';
    const report = buildErrorReport(err);
    expect(report.message).not.toContain('LEAKED_VALUE');
    expect(report.stack).not.toContain('LEAKED_VALUE');
    expect(report.stack).toContain('at foo');
  });

  it('records only the type of a non-Error throwable', () => {
    const report = buildErrorReport({ secretMealPlan: 'chicken and rice' });
    expect(report.message).toBe('Non-Error value of type object');
    expect(JSON.stringify(report)).not.toContain('chicken');
  });

  it('keeps a thrown string but redacts it', () => {
    expect(buildErrorReport('plain failure').message).toBe('plain failure');
    expect(buildErrorReport('key sk-ant-api03-abcdef').message).toContain(
      '[redacted]',
    );
  });

  it('truncates a very long stack', () => {
    const err = new Error('long');
    err.stack = 'x'.repeat(10_000);
    expect(buildErrorReport(err).stack!.length).toBeLessThan(4_100);
  });

  it('stringifies extra primitives and drops nested objects', () => {
    const report = buildErrorReport(new Error('boom'), {
      where: 'react',
      extra: { line: 42, ok: false, payload: { weightKg: 81 } },
    });
    expect(report.extra).toEqual({
      line: '42',
      ok: 'false',
      payload: '[object]',
    });
    expect(JSON.stringify(report)).not.toContain('81');
  });

  it('tags the caller-supplied `where`, defaulting to unknown', () => {
    expect(buildErrorReport(new Error('x')).where).toBe('unknown');
    expect(buildErrorReport(new Error('x'), { where: 'auth' }).where).toBe('auth');
  });
});

describe('reportError', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

  beforeEach(() => {
    resetErrorReporterForTests();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    // Tests run with import.meta.env.DEV true; opt in the way `vercel dev` does.
    vi.stubEnv('VITE_ERROR_REPORTING', 'on');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('POSTs a JSON body to /api/log with keepalive', () => {
    reportError(new Error('boom'), { where: 'llm' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/log');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string).where).toBe('llm');
  });

  it('is a no-op when reporting is switched off', () => {
    vi.stubEnv('VITE_ERROR_REPORTING', 'off');
    reportError(new Error('boom'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caps reports per session so an error loop cannot flood', () => {
    for (let i = 0; i < 50; i++) reportError(new Error(`boom ${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it('swallows a failing transport', () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(() => reportError(new Error('boom'))).not.toThrow();
  });
});

describe('endpoint self-disable', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

  beforeEach(() => {
    resetErrorReporterForTests();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_ERROR_REPORTING', 'on');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** Let the in-flight `postTelemetry` promise settle. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  // A permanently-unavailable endpoint would otherwise consume the whole
  // per-page budget on requests that can never land: 404/405 = no `/api` tier,
  // 401 = an auth gate in front of it.
  it.each([401, 404, 405])('stops posting after a %i', async (status) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    reportError(new Error('first'));
    await settle();

    reportError(new Error('second'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps posting after a 403, which is our own origin check', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    reportError(new Error('first'));
    await settle();

    reportError(new Error('second'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
