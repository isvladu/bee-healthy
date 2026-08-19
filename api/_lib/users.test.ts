import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Update {
  values: Record<string, unknown>;
  filters: Record<string, unknown>;
}
const updates: Update[] = [];

vi.mock('./supabase.js', () => ({
  serviceClient: () => ({
    from() {
      return {
        update(values: Record<string, unknown>) {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return chain;
            },
            then(resolve: (value: { error: null }) => unknown) {
              updates.push({ values, filters });
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return chain;
        },
      };
    },
  }),
}));

const {
  clearFailedLogins,
  isLocked,
  lockDurationMs,
  normalizeEmail,
  publicUser,
  registerFailedLogin,
} = await import('./users.js');

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-a',
    email: 'a@example.com',
    password_hash: 'scrypt$65536$8$1$c2FsdA==$aGFzaA==',
    email_verified: false,
    failed_attempts: 0,
    locked_until: null,
    ...overrides,
  } as Parameters<typeof registerFailedLogin>[0];
}

beforeEach(() => {
  updates.length = 0;
});

describe('normalizeEmail', () => {
  it('lowercases and trims so one address cannot become two accounts', () => {
    expect(normalizeEmail('  A.User@Example.COM ')).toBe('a.user@example.com');
  });
});

describe('publicUser', () => {
  it('exposes only id, email and verification state', () => {
    const shaped = publicUser({
      id: 'user-a',
      email: 'a@example.com',
      email_verified: true,
    });
    expect(shaped).toEqual({
      id: 'user-a',
      email: 'a@example.com',
      emailVerified: true,
    });
  });

  it('cannot leak a password hash even when handed a full row', () => {
    // Whitelisted, not omitted: extra columns on the input are simply not read.
    const shaped = publicUser(
      user({ password_hash: 'scrypt$secret', locked_until: 'x' }) as never,
    );
    expect(shaped).not.toHaveProperty('password_hash');
    expect(shaped).not.toHaveProperty('locked_until');
    expect(shaped).not.toHaveProperty('failed_attempts');
    expect(JSON.stringify(shaped)).not.toContain('scrypt');
  });
});

describe('lockout', () => {
  it('does not lock before the threshold', () => {
    for (let attempts = 0; attempts < 5; attempts++) {
      expect(lockDurationMs(attempts)).toBe(0);
    }
  });

  it('locks at the threshold and backs off exponentially', () => {
    expect(lockDurationMs(5)).toBe(15 * 60 * 1000);
    expect(lockDurationMs(6)).toBe(30 * 60 * 1000);
    expect(lockDurationMs(7)).toBe(60 * 60 * 1000);
  });

  it('caps the lock at a day so an account is never bricked', () => {
    expect(lockDurationMs(50)).toBe(24 * 60 * 60 * 1000);
  });

  it('treats a past locked_until as unlocked', () => {
    expect(
      isLocked(user({ locked_until: new Date(Date.now() - 1000).toISOString() })),
    ).toBe(false);
    expect(
      isLocked(
        user({ locked_until: new Date(Date.now() + 60_000).toISOString() }),
      ),
    ).toBe(true);
    expect(isLocked(user())).toBe(false);
  });

  it('starts locking the account on the fifth consecutive failure', async () => {
    await registerFailedLogin(user({ failed_attempts: 4 }));

    expect(updates[0].values.failed_attempts).toBe(5);
    expect(updates[0].values.locked_until).toBeTruthy();
    expect(updates[0].filters.id).toBe('user-a');
  });

  it('counts earlier failures without locking', async () => {
    await registerFailedLogin(user({ failed_attempts: 1 }));

    expect(updates[0].values.failed_attempts).toBe(2);
    expect(updates[0].values.locked_until).toBe(null);
  });

  it('resets the counters on a successful login', async () => {
    await clearFailedLogins('user-a');

    expect(updates[0].values).toMatchObject({
      failed_attempts: 0,
      locked_until: null,
    });
  });
});
