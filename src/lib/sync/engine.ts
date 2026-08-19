import { db } from '@/lib/db/repositories';
import { BackendError, apiFetch, isUnconfigured, postJson } from '@/lib/backend/client';
import { logEvent, logEventOnce } from '@/lib/telemetry/logEvent';
import { reportError } from '@/lib/telemetry/reportError';
import {
  mergeRemoteIntoLocal,
  sanitizeForSync,
  shouldApplyRemote,
  SYNCABLE_TABLES,
  type SyncableTable,
} from './serialize';

const EPOCH = '1970-01-01T00:00:00.000Z';

/** Must not exceed `MAX_PUSH_RECORDS` in `api/_lib/schemas.ts`. */
const PUSH_CHUNK = 200;
/** Safety stop for the pull loop — a runaway would hammer the API. */
const MAX_PULL_PAGES = 20;

function lastPulledKey(userId: string): string {
  return `bee-sync-last-pulled:${userId}`;
}

interface AnyLocal {
  id: string;
  updatedAt: string;
  syncStatus: string;
  [key: string]: unknown;
}

interface PendingEntry {
  table: SyncableTable;
  row: AnyLocal;
}

interface RemoteRecord {
  id: string;
  type: string;
  updatedAt: string;
  deleted: boolean;
  data: Record<string, unknown>;
}

/**
 * A missing or unconfigured server tier is a normal state for a local-first
 * app, not a failure: the caller gets 0 and the app carries on offline.
 */
function isNoBackend(err: unknown): boolean {
  if (isUnconfigured(err)) {
    logEventOnce('info', 'sync.skipped.unconfigured');
    return true;
  }
  return false;
}

/**
 * Push all locally-pending records to the server, then mark them synced.
 *
 * Takes no user id: the server reads the user from the session cookie and
 * would ignore one anyway. (Pull still takes one, because the watermark it
 * reads is per-user local storage on this device.)
 */
export async function pushPending(): Promise<number> {
  try {
    return await push();
  } catch (err) {
    if (isNoBackend(err)) return 0;
    // Report the failure, then rethrow so the UI still shows its own message.
    reportError(err, { where: 'sync', extra: { phase: 'push' } });
    throw err;
  }
}

async function push(): Promise<number> {
  const pending: PendingEntry[] = [];
  for (const table of SYNCABLE_TABLES) {
    const rows = (await db
      .table(table)
      .filter((r: AnyLocal) => r.syncStatus === 'pending')
      .toArray()) as AnyLocal[];
    for (const row of rows) pending.push({ table, row });
  }
  if (pending.length === 0) return 0;

  let pushed = 0;
  for (let start = 0; start < pending.length; start += PUSH_CHUNK) {
    const chunk = pending.slice(start, start + PUSH_CHUNK);

    await postJson('/api/sync/push', {
      records: chunk.map(({ table, row }) => ({
        id: row.id,
        type: table,
        updatedAt: row.updatedAt,
        deleted: false,
        // The server strips device-only fields again, but this stays the
        // primary defense: the API key must not leave the device at all.
        data: sanitizeForSync(table, row),
      })),
    });

    // Only rows the server accepted are marked synced, so a mid-run failure
    // leaves the rest pending for the next attempt rather than losing them.
    for (const { table, row } of chunk) {
      await db.table(table).put({ ...row, syncStatus: 'synced' });
    }
    pushed += chunk.length;
  }

  if (pending.length > PUSH_CHUNK) {
    logEvent('info', 'sync.push.chunked', {
      rows: pending.length,
      chunks: Math.ceil(pending.length / PUSH_CHUNK),
    });
  }
  return pushed;
}

/** Pull records changed since the last pull and merge them locally (LWW). */
export async function pullRemote(userId: string): Promise<number> {
  try {
    return await pull(userId);
  } catch (err) {
    if (isNoBackend(err)) return 0;
    reportError(err, { where: 'sync', extra: { phase: 'pull' } });
    throw err;
  }
}

async function pull(userId: string): Promise<number> {
  let since = localStorage.getItem(lastPulledKey(userId)) ?? EPOCH;
  if (since === EPOCH) logEvent('info', 'sync.first_pull');

  let applied = 0;
  let pages = 0;

  // The server reports whether its page was truncated, so we keep pulling
  // instead of advancing the watermark past records we never saw — the silent
  // data loss the old single-shot pull could only warn about.
  for (;;) {
    const page = await apiFetch<{ records: RemoteRecord[]; complete: boolean }>(
      `/api/sync/pull?since=${encodeURIComponent(since)}`,
    );
    pages++;

    for (const row of page.records) {
      const table = row.type as SyncableTable;
      if (!SYNCABLE_TABLES.includes(table)) {
        // Schema drift: a row written by a newer client than this one.
        logEvent('warn', 'sync.remote_row.unknown_table', {
          type: String(row.type).slice(0, 40),
        });
        continue;
      }

      const local = (await db.table(table).get(row.id)) as AnyLocal | undefined;
      if (shouldApplyRemote(row.updatedAt, local?.updatedAt)) {
        if (local?.syncStatus === 'pending') {
          // Last-write-wins is about to discard an edit made on *this* device
          // and never pushed. Ordinary remote-beats-synced updates aren't
          // logged — they'd bury this one.
          logEvent('warn', 'sync.conflict.pending_overwritten', {
            table,
            remoteNewerByMs:
              Date.parse(row.updatedAt) - Date.parse(local.updatedAt) || 0,
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
      if (row.updatedAt > since) since = row.updatedAt;
    }

    localStorage.setItem(lastPulledKey(userId), since);

    if (page.complete || page.records.length === 0) break;
    if (pages >= MAX_PULL_PAGES) {
      logEvent('warn', 'sync.pull.page_limit', { pages });
      break;
    }
  }

  return applied;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/** Full reconciliation: push local changes, then pull remote changes. */
export async function runSync(userId: string): Promise<SyncResult> {
  const startedAt = Date.now();
  const pushed = await pushPending();
  const pulled = await pullRemote(userId);
  logEvent('info', 'sync.completed', {
    pushed,
    pulled,
    durationMs: Date.now() - startedAt,
  });
  return { pushed, pulled };
}

/** True when a sync failure means "sign in again" rather than "try later". */
export function isAuthExpired(err: unknown): boolean {
  return err instanceof BackendError && err.status === 401;
}
