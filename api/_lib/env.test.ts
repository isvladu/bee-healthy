import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appUrl, backendEnv, isBackendConfigured } from './env.js';

beforeEach(() => {
  // Vercel sets these on every deployment; start from a clean slate.
  vi.stubEnv('APP_URL', '');
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('VERCEL_URL', '');
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('appUrl', () => {
  it('uses the production domain on a production deployment', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'beehealthy.app');
    vi.stubEnv('VERCEL_URL', 'bee-healthy-abc123.vercel.app');

    expect(appUrl()).toBe('https://beehealthy.app');
  });

  it('uses the deployment’s own URL on a preview', () => {
    // The bug this guards: VERCEL_PROJECT_PRODUCTION_URL is set here too, so
    // preferring it would email production links from staging — and because
    // both share a database, the token would work there.
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'beehealthy.app');
    vi.stubEnv('VERCEL_URL', 'bee-healthy-abc123.vercel.app');

    expect(appUrl()).toBe('https://bee-healthy-abc123.vercel.app');
  });

  it('lets APP_URL override everything', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'bee-healthy-abc123.vercel.app');
    vi.stubEnv('APP_URL', 'https://staging.beehealthy.app');

    expect(appUrl()).toBe('https://staging.beehealthy.app');
  });

  it('trims a trailing slash so links never double up', () => {
    vi.stubEnv('APP_URL', 'https://staging.beehealthy.app/');
    expect(appUrl()).toBe('https://staging.beehealthy.app');
  });

  it('falls back to localhost off-platform', () => {
    expect(appUrl()).toBe('http://localhost:3000');
  });
});

describe('isBackendConfigured', () => {
  it('requires all three server variables', () => {
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('SESSION_SECRET', '');
    expect(isBackendConfigured()).toBe(false);

    vi.stubEnv('SESSION_SECRET', 'secret');
    expect(isBackendConfigured()).toBe(true);
  });

  it('throws a recognizable error when unconfigured, for the 503 path', () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('SESSION_SECRET', '');
    // `withErrorHandling` matches on this exact message to answer 503 rather
    // than 500, which is how the client knows to stay local-only.
    expect(() => backendEnv()).toThrow('backend_unconfigured');
  });
});
