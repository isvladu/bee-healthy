/**
 * Password hashing.
 *
 * `crypto.scrypt` from Node's standard library (§5.5's zero-dependency option)
 * rather than `@node-rs/argon2`: scrypt is memory-hard and built in, which
 * keeps a native binary out of the serverless bundle. Parameters are stored
 * alongside each hash, so they can be raised later without invalidating
 * existing passwords.
 *
 * Deliberately NOT peppered with `SESSION_SECRET`. A pepper would help against
 * a database-only leak, but losing or rotating it permanently locks every user
 * out of their account with no recovery path. Session and email tokens *are*
 * peppered (see `tokens.ts`) because rotating that secret merely signs everyone
 * out, which is recoverable.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * ~64 MB of memory per hash (128 * N * r). Comfortable inside a Vercel
 * function's default allocation, and costly enough to make offline cracking of
 * a leaked hash expensive.
 */
const N = 65536;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAX_MEM = 128 * 1024 * 1024;

/** Rejects a password before it ever reaches the hasher. */
export const MIN_PASSWORD_LENGTH = 10;
/** Bounds the work an unauthenticated caller can force us to do. */
export const MAX_PASSWORD_LENGTH = 200;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: MAX_MEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/** Returns `scrypt$N$r$p$salt$hash`, all base64. Safe to store as-is. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, N, R, P);
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * Constant-time verification. Returns false — never throws — for a malformed
 * or unrecognized stored value, so a corrupt row can't 500 the login endpoint.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  // A hostile row could otherwise name parameters that exhaust memory or CPU.
  if (n < 16384 || n > 1048576 || r < 1 || r > 32 || p < 1 || p > 16) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  let actual: Buffer;
  try {
    actual = await derive(password, salt, n, r, p);
  } catch {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

/**
 * Burn the same work as a real verification without comparing anything.
 *
 * Called on the "no such account" branch of login so that a missing email and a
 * wrong password take indistinguishable time — otherwise response latency
 * enumerates our user list.
 */
export async function burnPasswordWork(password: string): Promise<void> {
  await derive(password, randomBytes(SALT_LENGTH), N, R, P);
}
