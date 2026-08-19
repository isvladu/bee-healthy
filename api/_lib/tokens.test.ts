import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken, randomToken, tokensMatch } from './tokens';

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  vi.stubEnv('SESSION_SECRET', 'secret-one');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('randomToken', () => {
  it('produces 256 bits of url-safe randomness', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).toHaveLength(43); // 32 bytes, base64url, unpadded
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(seen.size).toBe(200);
  });
});

describe('hashToken', () => {
  it('is stable for the same token and secret', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('does not contain or resemble the token', () => {
    const token = randomToken();
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is keyed by SESSION_SECRET, so a stolen table cannot be brute-forced offline', () => {
    const withFirstSecret = hashToken('abc');
    vi.stubEnv('SESSION_SECRET', 'secret-two');
    expect(hashToken('abc')).not.toBe(withFirstSecret);
  });
});

describe('tokensMatch', () => {
  it('compares equal digests', () => {
    const hash = hashToken('abc');
    expect(tokensMatch(hash, hash)).toBe(true);
  });

  it('rejects different or malformed digests', () => {
    expect(tokensMatch(hashToken('abc'), hashToken('abd'))).toBe(false);
    expect(tokensMatch('', '')).toBe(false);
    expect(tokensMatch('ab', hashToken('abc'))).toBe(false);
  });
});
