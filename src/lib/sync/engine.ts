import { db } from '@/lib/db/repositories';
import { getSupabase } from '@/lib/supabase/client';
import {
  mergeRemoteIntoLocal,
  sanitizeForSync,
  shouldApplyRemote,
  SYNCABLE_TABLES,
  type SyncableTable,
} from './serialize';

const TABLE = 'records';
const EPOCH = '1970-01-01T00:00:00Z';

function lastPulledKey(userId: string): string {
  return `bee-sync-last-pulled:${userId}`;
}

interface AnyLocal {
  id: string;
  updatedAt: string;
  syncStatus: string;
  [key: string]: unknown;
}

/** Push all locally-pending records to the cloud, then mark them synced. */
export async function pushPending(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  let pushed = 0;
  for (const table of SYNCABLE_TABLES) {
    const rows = (await db
      .table(table)
      .filter((r: AnyLocal) => r.syncStatus === 'pending')
      .toArray()) as AnyLocal[];
    if (rows.length === 0) continue;

    const payload = rows.map((row) => ({
      user_id: userId,
      id: row.id,
      type: table,
      updated_at: row.updatedAt,
      deleted: false,
      data: sanitizeForSync(table, row),
    }));

    const { error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: 'user_id,id' });
    if (error) throw new Error(error.message);

    await db.table(table).bulkPut(rows.map((r) => ({ ...r, syncStatus: 'synced' })));
    pushed += rows.length;
  }
  return pushed;
}

/** Pull records changed since the last pull and merge them locally (LWW). */
export async function pullRemote(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const since = localStorage.getItem(lastPulledKey(userId)) ?? EPOCH;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true });
  if (error) throw new Error(error.message);

  let applied = 0;
  let maxUpdated = since;

  for (const row of data ?? []) {
    const table = row.type as SyncableTable;
    if (!SYNCABLE_TABLES.includes(table)) continue;

    const local = (await db.table(table).get(row.id)) as AnyLocal | undefined;
    if (shouldApplyRemote(row.updated_at, local?.updatedAt)) {
      if (row.deleted) {
        await db.table(table).delete(row.id);
      } else {
        const merged = mergeRemoteIntoLocal(table, row.data, local);
        await db.table(table).put({ ...merged, syncStatus: 'synced' });
      }
      applied++;
    }
    if (row.updated_at > maxUpdated) maxUpdated = row.updated_at;
  }

  localStorage.setItem(lastPulledKey(userId), maxUpdated);
  return applied;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/** Full reconciliation: push local changes, then pull remote changes. */
export async function runSync(userId: string): Promise<SyncResult> {
  const pushed = await pushPending(userId);
  const pulled = await pullRemote(userId);
  return { pushed, pulled };
}
