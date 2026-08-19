import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNCABLE_TABLES } from '../../src/lib/sync/serialize';

interface UpsertCall {
  table: string;
  payload: Record<string, unknown>[];
  options: unknown;
}
interface SelectCall {
  table: string;
  filters: Record<string, unknown>;
}

const upserts: UpsertCall[] = [];
const selects: SelectCall[] = [];
let selectRows: unknown[] = [];

vi.mock('./supabase', () => ({
  serviceClient: () => ({
    from(table: string) {
      return {
        upsert(payload: Record<string, unknown>[], options: unknown) {
          upserts.push({ table, payload, options });
          return Promise.resolve({ error: null });
        },
        select() {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return chain;
            },
            gt(column: string, value: unknown) {
              filters[`gt:${column}`] = value;
              return chain;
            },
            order() {
              return chain;
            },
            limit() {
              selects.push({ table, filters });
              return Promise.resolve({ data: selectRows, error: null });
            },
          };
          return chain;
        },
      };
    },
  }),
}));

const { isSyncableType, stripDeviceOnlyFields, SYNCABLE_TYPES, userScope } =
  await import('./data');

beforeEach(() => {
  upserts.length = 0;
  selects.length = 0;
  selectRows = [];
});

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rec-1',
    type: 'dietPlans' as const,
    updatedAt: '2026-08-19T10:00:00.000Z',
    deleted: false,
    data: { title: 'Cutting block' },
    ...overrides,
  };
}

describe('userScope — cross-user isolation', () => {
  it('stamps every row with the scope owner, not anything from the caller', async () => {
    await userScope('user-a').upsertRecords([record()]);

    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload[0].user_id).toBe('user-a');
  });

  it('ignores a user_id smuggled in by the caller', async () => {
    // The typed API has no user_id field, so a hostile client would have to
    // send an extra property. It must not survive.
    const hostile = record({ user_id: 'user-victim' }) as never;
    await userScope('user-a').upsertRecords([hostile]);

    expect(upserts[0].payload[0].user_id).toBe('user-a');
  });

  it('ignores a user_id smuggled inside the opaque data payload', async () => {
    await userScope('user-a').upsertRecords([
      record({ data: { title: 'x', user_id: 'user-victim' } }),
    ]);

    expect(upserts[0].payload[0].user_id).toBe('user-a');
    expect(upserts[0].payload[0].data).not.toHaveProperty('user_id');
  });

  it('gives two scopes two different owners for identical input', async () => {
    await userScope('user-a').upsertRecords([record()]);
    await userScope('user-b').upsertRecords([record()]);

    expect(upserts[0].payload[0].user_id).toBe('user-a');
    expect(upserts[1].payload[0].user_id).toBe('user-b');
  });

  it('always filters reads by the scope owner', async () => {
    await userScope('user-a').listRecordsSince('2026-01-01T00:00:00.000Z', 500);

    expect(selects[0].filters.user_id).toBe('user-a');
    expect(selects[0].filters['gt:updated_at']).toBe('2026-01-01T00:00:00.000Z');
  });

  it('skips the round trip entirely for an empty batch', async () => {
    expect(await userScope('user-a').upsertRecords([])).toBe(0);
    expect(upserts).toHaveLength(0);
  });
});

describe('stripDeviceOnlyFields', () => {
  it('never lets the LLM API key reach the database', () => {
    const cleaned = stripDeviceOnlyFields('settings', {
      id: 'app',
      apiKey: 'sk-ant-secret-value',
      units: 'metric',
    });

    expect(cleaned).not.toHaveProperty('apiKey');
    expect(JSON.stringify(cleaned)).not.toContain('sk-ant');
    expect(cleaned.units).toBe('metric');
  });

  it('strips the local-only syncStatus from every type', () => {
    for (const type of SYNCABLE_TYPES) {
      const cleaned = stripDeviceOnlyFields(type, {
        id: 'x',
        syncStatus: 'pending',
      });
      expect(cleaned).not.toHaveProperty('syncStatus');
    }
  });

  it('leaves ordinary content untouched', () => {
    const cleaned = stripDeviceOnlyFields('recipes', {
      title: 'Oats',
      servings: 2,
    });
    expect(cleaned).toEqual({ title: 'Oats', servings: 2 });
  });
});

describe('upsertRecords — payload shape', () => {
  it('re-strips the API key server-side even when the client forgot to', async () => {
    // Defense in depth: `sanitizeForSync` runs in the browser, and the browser
    // is not something we get to trust.
    await userScope('user-a').upsertRecords([
      record({
        type: 'settings',
        data: { id: 'app', apiKey: 'sk-ant-leaked', units: 'metric' },
      }),
    ]);

    const stored = upserts[0].payload[0].data as Record<string, unknown>;
    expect(stored).not.toHaveProperty('apiKey');
    expect(JSON.stringify(upserts[0].payload)).not.toContain('sk-ant-leaked');
  });

  it('stores no content on a tombstone', async () => {
    await userScope('user-a').upsertRecords([
      record({ deleted: true, data: { title: 'Deleted plan' } }),
    ]);

    expect(upserts[0].payload[0].deleted).toBe(true);
    expect(upserts[0].payload[0].data).toEqual({});
  });

  it('upserts on the composite key so one user cannot clobber another', async () => {
    await userScope('user-a').upsertRecords([record()]);
    expect(upserts[0].options).toEqual({ onConflict: 'user_id,id' });
  });
});

describe('SYNCABLE_TYPES', () => {
  it('matches the client list exactly', () => {
    // `api/` and `src/` are separate TS projects, so the list is duplicated.
    // This is the guard that keeps the copies honest.
    expect([...SYNCABLE_TYPES]).toEqual([...SYNCABLE_TABLES]);
  });

  it('rejects anything not on the list', () => {
    expect(isSyncableType('dietPlans')).toBe(true);
    expect(isSyncableType('app_users')).toBe(false);
    expect(isSyncableType('records')).toBe(false);
    expect(isSyncableType(null)).toBe(false);
  });
});
