import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { buildLogEntry, isAllowedOrigin, scrubSecrets } from './log';

type Handler = Parameters<typeof handler>;

function makeReq(overrides: Record<string, unknown> = {}): Handler[0] {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '120',
      origin: 'https://bee-healthy.vercel.app',
      host: 'bee-healthy.vercel.app',
    },
    body: { message: 'boom', where: 'llm' },
    ...overrides,
  } as unknown as Handler[0];
}

function makeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    end() {
      return res;
    },
  };
  return res as unknown as Handler[1] & typeof res;
}

describe('scrubSecrets', () => {
  it('redacts keys and tokens', () => {
    const out = scrubSecrets(
      'sk-ant-api03-LEAKED and Bearer abc123.def-456 and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.Zm9v',
    );
    expect(out).not.toMatch(/sk-ant-/);
    expect(out).not.toMatch(/abc123/);
    expect(out).not.toMatch(/eyJhbGci/);
  });
});

describe('isAllowedOrigin', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('allows the deployment its own host', () => {
    expect(isAllowedOrigin('https://bee.example.com', 'bee.example.com')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000', 'localhost:3000')).toBe(true);
  });

  it('allows the Vercel-generated production URL', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'bee-healthy.vercel.app');
    expect(isAllowedOrigin('https://bee-healthy.vercel.app', undefined)).toBe(true);
  });

  it('allows an explicitly configured custom domain', () => {
    vi.stubEnv('ERROR_LOG_ALLOWED_ORIGINS', 'https://beehealthy.app, https://www.beehealthy.app');
    expect(isAllowedOrigin('https://www.beehealthy.app', 'other.host')).toBe(true);
  });

  it('rejects other origins and a missing Origin header', () => {
    expect(isAllowedOrigin('https://evil.example', 'bee.example.com')).toBe(false);
    expect(isAllowedOrigin(undefined, 'bee.example.com')).toBe(false);
  });
});

describe('buildLogEntry', () => {
  it('whitelists fields and tags the line for the log sink', () => {
    const entry = buildLogEntry({
      message: 'boom',
      name: 'Error',
      where: 'sync',
      route: '/diet/abc',
      appVersion: '0.0.0',
      dietPlan: { meals: ['omelette'] },
      apiKey: 'sk-ant-api03-secret',
    });
    expect(entry).toMatchObject({ level: 'error', source: 'client', message: 'boom' });
    expect(JSON.stringify(entry)).not.toContain('omelette');
    expect(JSON.stringify(entry)).not.toContain('sk-ant-');
  });

  it('scrubs secrets that reached the server anyway', () => {
    const entry = buildLogEntry({
      message: 'Invalid key sk-ant-api03-LEAKED_VALUE_1234',
      stack: 'at call (sk-ant-api03-LEAKED_VALUE_1234)',
    });
    expect(JSON.stringify(entry)).not.toContain('LEAKED_VALUE');
  });

  it('truncates an oversized stack', () => {
    const entry = buildLogEntry({ message: 'boom', stack: 'x'.repeat(50_000) })!;
    expect((entry.stack as string).length).toBe(6000);
  });

  it('ignores bodies with nothing loggable', () => {
    expect(buildLogEntry(null)).toBeNull();
    expect(buildLogEntry('not json')).toBeNull();
    expect(buildLogEntry([1, 2])).toBeNull();
    expect(buildLogEntry({ where: 'llm' })).toBeNull();
  });

  it('parses a raw JSON string body', () => {
    expect(buildLogEntry('{"message":"boom"}')?.message).toBe('boom');
  });
});

describe('handler', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('logs a valid report and answers 204', () => {
    const res = makeRes();
    handler(makeReq(), res);
    expect(res.statusCode).toBe(204);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('rejects non-POST with 405', () => {
    const res = makeRes();
    handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects a non-JSON content type with 415', () => {
    const res = makeRes();
    handler(makeReq({ headers: { 'content-type': 'text/plain' } }), res);
    expect(res.statusCode).toBe(415);
  });

  it('rejects an oversized body with 413', () => {
    const res = makeRes();
    handler(
      makeReq({
        headers: {
          'content-type': 'application/json',
          'content-length': String(20 * 1024),
          origin: 'https://bee-healthy.vercel.app',
          host: 'bee-healthy.vercel.app',
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(413);
  });

  it('rejects a cross-site origin with 403', () => {
    const res = makeRes();
    handler(
      makeReq({
        headers: {
          'content-type': 'application/json',
          origin: 'https://evil.example',
          host: 'bee-healthy.vercel.app',
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('answers 204 without logging when the body is unusable', () => {
    const res = makeRes();
    handler(makeReq({ body: { nope: true } }), res);
    expect(res.statusCode).toBe(204);
    expect(console.error).not.toHaveBeenCalled();
  });
});
