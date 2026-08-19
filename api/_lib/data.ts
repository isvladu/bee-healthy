/**
 * User-scoped data access — the single chokepoint for every `records` query.
 *
 * With the service-role key, RLS no longer protects a row: `select * from
 * records` would happily return every user's data. Authorization now lives
 * here, in code. The contract is deliberately narrow:
 *
 *   - `userScope(userId)` captures the *session* user in a closure.
 *   - No method accepts a user id as an argument, and no caller-supplied
 *     `user_id` on an incoming row is ever read. There is no way to express a
 *     cross-user query with this API.
 *
 * If you add a method here, it must filter by the captured `userId` and must
 * overwrite rather than trust any `user_id` in its input.
 */
import { serviceClient } from './supabase';

/**
 * Mirrors `SYNCABLE_TABLES` in `src/lib/sync/serialize.ts`. Duplicated rather
 * than imported because `api/` and `src/` are separate TypeScript projects;
 * `data.test.ts` asserts the two lists stay identical.
 */
export const SYNCABLE_TYPES = [
  'settings',
  'dietPlans',
  'recipes',
  'shoppingLists',
  'workoutPlans',
  'bodyMetrics',
] as const;

export type SyncableType = (typeof SYNCABLE_TYPES)[number];

export function isSyncableType(value: unknown): value is SyncableType {
  return (
    typeof value === 'string' &&
    (SYNCABLE_TYPES as readonly string[]).includes(value)
  );
}

export interface SyncRecordInput {
  id: string;
  type: SyncableType;
  updatedAt: string;
  deleted: boolean;
  data: Record<string, unknown>;
}

export interface SyncRecordRow {
  id: string;
  type: string;
  updated_at: string;
  deleted: boolean;
  data: Record<string, unknown>;
}

/**
 * Defense in depth against the client's `sanitizeForSync`. The browser already
 * strips these, but the browser is not something we get to trust: if a modified
 * or stale client ever posts a settings record with `apiKey` on it, the key
 * must not reach the database. Mirrors `sanitizeForSync`.
 */
export function stripDeviceOnlyFields(
  type: SyncableType,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const clone = { ...data };
  delete clone.syncStatus; // local-only
  if (type === 'settings') delete clone.apiKey; // must never leave the device
  // A row carries its owner in its own column; an `user_id` inside the JSON
  // payload has no meaning and could only mislead a future reader.
  delete clone.user_id;
  return clone;
}

export function userScope(userId: string) {
  return {
    /**
     * Upsert a batch of records for the session user. Returns the number of
     * rows written.
     */
    async upsertRecords(rows: SyncRecordInput[]): Promise<number> {
      if (rows.length === 0) return 0;

      const payload = rows.map((row) => ({
        // Not `...row` — the user id is the captured session user, and nothing
        // the caller sent can influence it.
        user_id: userId,
        id: row.id,
        type: row.type,
        updated_at: row.updatedAt,
        deleted: row.deleted,
        data: row.deleted ? {} : stripDeviceOnlyFields(row.type, row.data),
      }));

      const { error } = await serviceClient()
        .from('records')
        .upsert(payload, { onConflict: 'user_id,id' });
      if (error) throw new Error(`records_upsert_failed: ${error.message}`);
      return payload.length;
    },

    /** Records changed strictly after `since`, oldest first. */
    async listRecordsSince(
      since: string,
      limit: number,
    ): Promise<SyncRecordRow[]> {
      const { data, error } = await serviceClient()
        .from('records')
        .select('id, type, updated_at, deleted, data')
        .eq('user_id', userId)
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .limit(limit);
      if (error) throw new Error(`records_select_failed: ${error.message}`);
      return (data ?? []) as SyncRecordRow[];
    },
  };
}

export type UserScope = ReturnType<typeof userScope>;
