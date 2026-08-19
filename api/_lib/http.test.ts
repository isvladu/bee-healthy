import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clientIp,
  guardGet,
  guardPost,
  isAllowedOrigin,
  isSecureRequest,
  MAX_BODY_BYTES,
  withErrorHandling,
} from './http';

function makeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

type Res = ReturnType<typeof makeRes>;
const asRes = (res: Res) => res as unknown as VercelResponse;

function makeReq(overrides: Record<string, unknown> = {}): VercelRequest {
  // `headers` is pulled out of the rest so overriding one header merges with
  // the defaults instead of replacing the whole object.
  const { headers, ...rest } = overrides as {
    headers?: Record<string, string>;
  } & Record<string, unknown>;

  return {
    method: 'POST',
    body: {},
    ...rest,
    headers: {
      'content-type': 'application/json',
      'content-length': '120',
      origin: 'https://bee-healthy.vercel.app',
      host: 'bee-healthy.vercel.app',
      ...(headers ?? {}),
    },
  } as unknown as VercelRequest;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAllowedOrigin', () => {
  it('allows the deployment’s own host over either scheme', () => {
    expect(isAllowedOrigin('https://app.example', 'app.example')).toBe(true);
    // `vercel dev` serves plain http on localhost.
    expect(isAllowedOrigin('http://localhost:3000', 'localhost:3000')).toBe(true);
  });

  it('rejects a foreign origin — this is the CSRF guard', () => {
    expect(isAllowedOrigin('https://evil.example', 'app.example')).toBe(false);
  });

  it('rejects a missing Origin on a state-changing request', () => {
    expect(isAllowedOrigin(undefined, 'app.example')).toBe(false);
  });

  it('does not accept a prefix or suffix of an allowed origin', () => {
    expect(isAllowedOrigin('https://app.example.evil.com', 'app.example')).toBe(
      false,
    );
    expect(isAllowedOrigin('https://evil-app.example', 'app.example')).toBe(false);
  });

  it('honours APP_ALLOWED_ORIGINS for a custom domain', () => {
    vi.stubEnv(
      'APP_ALLOWED_ORIGINS',
      'https://beehealthy.app, https://www.beehealthy.app',
    );
    expect(isAllowedOrigin('https://beehealthy.app', 'other.host')).toBe(true);
    expect(isAllowedOrigin('https://www.beehealthy.app', 'other.host')).toBe(true);
    expect(isAllowedOrigin('https://nope.app', 'other.host')).toBe(false);
  });

  it('honours a caller-supplied extra list', () => {
    expect(
      isAllowedOrigin('https://legacy.app', 'other.host', 'https://legacy.app'),
    ).toBe(true);
  });
});

describe('guardPost', () => {
  it('accepts a well-formed same-origin POST', () => {
    const res = makeRes();
    expect(guardPost(makeReq(), asRes(res))).toBe(true);
  });

  it('rejects any other method', () => {
    const res = makeRes();
    expect(guardPost(makeReq({ method: 'GET' }), asRes(res))).toBe(false);
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('POST');
  });

  it('rejects a non-JSON content type', () => {
    const res = makeRes();
    const req = makeReq({ headers: { 'content-type': 'text/plain' } });
    expect(guardPost(req, asRes(res))).toBe(false);
    expect(res.statusCode).toBe(415);
  });

  it('rejects an oversized body', () => {
    const res = makeRes();
    const req = makeReq({
      headers: { 'content-length': String(MAX_BODY_BYTES + 1) },
    });
    expect(guardPost(req, asRes(res))).toBe(false);
    expect(res.statusCode).toBe(413);
  });

  it('rejects a cross-origin POST with 403', () => {
    const res = makeRes();
    const req = makeReq({ headers: { origin: 'https://evil.example' } });
    expect(guardPost(req, asRes(res))).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden_origin' });
  });

  it('never caches a response', () => {
    const res = makeRes();
    guardPost(makeReq(), asRes(res));
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('guardGet', () => {
  it('accepts GET and rejects everything else', () => {
    const ok = makeRes();
    expect(guardGet(makeReq({ method: 'GET' }), asRes(ok))).toBe(true);

    const bad = makeRes();
    expect(guardGet(makeReq({ method: 'POST' }), asRes(bad))).toBe(false);
    expect(bad.statusCode).toBe(405);
  });
});

describe('isSecureRequest', () => {
  it('drops the Secure cookie flag only on localhost', () => {
    expect(isSecureRequest(makeReq({ headers: { host: 'app.example' } }))).toBe(
      true,
    );
    expect(
      isSecureRequest(makeReq({ headers: { host: 'localhost:3000' } })),
    ).toBe(false);
    expect(
      isSecureRequest(makeReq({ headers: { host: '127.0.0.1:3000' } })),
    ).toBe(false);
  });
});

describe('clientIp', () => {
  it('takes the first x-forwarded-for entry', () => {
    const req = makeReq({
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    });
    expect(clientIp(req)).toBe('203.0.113.7');
  });

  it('falls back to a constant rather than throwing', () => {
    expect(clientIp(makeReq())).toBe('unknown');
  });
});

describe('withErrorHandling', () => {
  it('maps an unconfigured backend to 503 so the client stays local-only', async () => {
    const res = makeRes();
    const handler = withErrorHandling(async () => {
      throw new Error('backend_unconfigured');
    });
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'backend_unconfigured' });
  });

  it('never leaks an internal error message to the client', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    const handler = withErrorHandling(async () => {
      throw new Error('password_update_failed: relation app_users does not exist');
    });
    await handler(makeReq(), asRes(res));

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error' });
    expect(JSON.stringify(res.body)).not.toContain('app_users');
    // …but the operator still gets the detail in the runtime logs.
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
