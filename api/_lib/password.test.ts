import { describe, expect, it } from 'vitest';
import {
  burnPasswordWork,
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from './password.js';

// scrypt is deliberately slow (~64 MB of work per call), so these get room.
const TIMEOUT = 20_000;

describe('hashPassword', () => {
  it(
    'round-trips a password',
    async () => {
      const stored = await hashPassword('correct horse battery staple');
      expect(await verifyPassword('correct horse battery staple', stored)).toBe(
        true,
      );
    },
    TIMEOUT,
  );

  it(
    'rejects the wrong password',
    async () => {
      const stored = await hashPassword('correct horse battery staple');
      expect(await verifyPassword('Correct horse battery staple', stored)).toBe(
        false,
      );
      expect(await verifyPassword('', stored)).toBe(false);
    },
    TIMEOUT,
  );

  it(
    'salts, so the same password never produces the same hash',
    async () => {
      const a = await hashPassword('same password here');
      const b = await hashPassword('same password here');
      expect(a).not.toBe(b);
      // …and both still verify.
      expect(await verifyPassword('same password here', a)).toBe(true);
      expect(await verifyPassword('same password here', b)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'never stores the password itself',
    async () => {
      const stored = await hashPassword('super secret passphrase');
      expect(stored).not.toContain('super secret passphrase');
      expect(stored.startsWith('scrypt$65536$8$1$')).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'treats unicode-equivalent passwords as equal (NFKC)',
    async () => {
      // "é" as a single code point vs. "e" + combining accent: a user typing
      // the same characters on a different keyboard must still get in.
      const stored = await hashPassword('café latte pass');
      expect(await verifyPassword('café latte pass', stored)).toBe(true);
    },
    TIMEOUT,
  );
});

describe('verifyPassword', () => {
  it('returns false rather than throwing on a malformed stored value', async () => {
    for (const bad of [
      '',
      'not-a-hash',
      'scrypt$65536$8$1$onlyfiveparts',
      'bcrypt$65536$8$1$c2FsdA==$aGFzaA==',
      'scrypt$abc$8$1$c2FsdA==$aGFzaA==',
    ]) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });

  it('refuses parameters that would exhaust the function', async () => {
    // A hostile or corrupt row must not be able to name an N that pins the CPU
    // and memory of every login request.
    const absurd = `scrypt$${2 ** 30}$8$1$c2FsdA==$${'A'.repeat(43)}=`;
    expect(await verifyPassword('anything', absurd)).toBe(false);

    const tooWeak = `scrypt$1024$8$1$c2FsdA==$${'A'.repeat(43)}=`;
    expect(await verifyPassword('anything', tooWeak)).toBe(false);
  });
});

describe('burnPasswordWork', () => {
  it(
    'completes, so the login miss path can equalize timing',
    async () => {
      await expect(burnPasswordWork('whatever')).resolves.toBeUndefined();
    },
    TIMEOUT,
  );
});

describe('length bounds', () => {
  it('sets a floor high enough to matter and a ceiling that bounds work', () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
    expect(MAX_PASSWORD_LENGTH).toBeLessThanOrEqual(1000);
  });
});
