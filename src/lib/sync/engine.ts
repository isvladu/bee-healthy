import { db } from '@/lib/db/repositories';
import { getSupabase } from '@/lib/supabase/client';
import { logEvent, logEventOnce } from '@/lib/telemetry/logEvent';
import { reportError } from '@/lib/telemetry/reportError';
import {
  mergeRemoteIntoLocal,
  sanitizeForSync,
  shouldApplyRemote,
  SYNCABLE_TABLES,
  type SyncableTable,
} from './serialize';

const TABLE = 'records';
const EPOCH = '1970-01-01T00:00:00Z';

/** Supabase caps an unbounded select; at this many rows the pull may be short. */
const PULL_PAGE_LIMIT = 1000;
/** There is no chunking on push — flag a batch big enough to be worth chunking. */
const LARGE_PUSH_ROWS = 200;

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
  try {
    return await push(userId);
  } catch (err) {
    // Report the failure, then rethrow so the UI still shows its own message.
    reportError(err, { where: 'sync', extra: { phase: 'push' } });
    throw err;
  }
}

async function push(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) {
    logEventOnce('info', 'sync.skipped.unconfigured');
    return 0;
  }

  let pushed = 0;
  for (const table of SYNCABLE_TABLES) {
    const rows = (await db
      .table(table)
      .filter((r: AnyLocal) => r.syncStatus === 'pending')
      .toArray()) as AnyLocal[];
    if (rows.length === 0) continue;
    if (rows.length > LARGE_PUSH_ROWS) {
      logEvent('warn', 'sync.push.large_batch', { table, rows: rows.length });
    }

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
  try {
    return await pull(userId);
  } catch (err) {
    reportError(err, { where: 'sync', extra: { phase: 'pull' } });
    throw err;
  }
}

async function pull(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) {
    logEventOnce('info', 'sync.skipped.unconfigured');
    return 0;
  }

  const since = localStorage.getItem(lastPulledKey(userId)) ?? EPOCH;
  if (since === EPOCH) logEvent('info', 'sync.first_pull');
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length >= PULL_PAGE_LIMIT) {
    // Supabase's default row cap — this pull is probably truncated, and the
    // watermark will still advance, so the tail would be lost silently.
    logEvent('warn', 'sync.pull.page_full', { rows: rows.length });
  }

  let applied = 0;
  let maxUpdated = since;

  for (const row of rows) {
    const table = row.type as SyncableTable;
    if (!SYNCABLE_TABLES.includes(table)) {
      // Schema drift: a row written by a newer client than this one.
      logEvent('warn', 'sync.remote_row.unknown_table', {
        type: String(row.type).slice(0, 40),
      });
      continue;
    }

    const local = (await db.table(table).get(row.id)) as AnyLocal | undefined;
    if (shouldApplyRemote(row.updated_at, local?.updatedAt)) {
      if (local?.syncStatus === 'pending') {
        // Last-write-wins is about to discard an edit made on *this* device and
        // never pushed. Ordinary remote-beats-synced updates aren't logged —
        // they'd bury this one.
        logEvent('warn', 'sync.conflict.pending_overwritten', {
          table,
          remoteNewerByMs:
            Date.parse(row.updated_at) - Date.parse(local.updatedAt) || 0,
        });
      }
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
  const startedAt = Date.now();
  const pushed = await pushPending(userId);
  const pulled = await pullRemote(userId);
  logEvent('info', 'sync.completed', {
    pushed,
    pulled,
    durationMs: Date.now() - startedAt,
  });
  return { pushed, pulled };
}
