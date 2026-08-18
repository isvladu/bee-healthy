// Pure helpers for turning local records into sync payloads and merging remote
// records back in. Kept side-effect-free so they're easy to unit-test — this is
// where the "never sync the API key" rule is enforced.

export type SyncableTable =
  | 'settings'
  | 'dietPlans'
  | 'recipes'
  | 'shoppingLists'
  | 'workoutPlans'
  | 'bodyMetrics';

export const SYNCABLE_TABLES: SyncableTable[] = [
  'settings',
  'dietPlans',
  'recipes',
  'shoppingLists',
  'workoutPlans',
  'bodyMetrics',
];

type AnyRecord = Record<string, unknown>;

/**
 * Strip fields that must not be stored in the cloud: the local-only `syncStatus`,
 * and — for settings — the on-device `apiKey`.
 */
export function sanitizeForSync(
  table: SyncableTable,
  record: AnyRecord,
): Record<string, unknown> {
  const clone: AnyRecord = { ...record };
  delete clone.syncStatus;
  if (table === 'settings') delete clone.apiKey;
  return clone;
}

/** Last-write-wins: apply the remote record when it's newer (ties → remote, idempotent). */
export function shouldApplyRemote(
  remoteUpdatedAt: string,
  localUpdatedAt: string | undefined,
): boolean {
  if (!localUpdatedAt) return true;
  return remoteUpdatedAt >= localUpdatedAt;
}

/**
 * Produce the object to write locally from a remote record, preserving device-only
 * fields (the settings `apiKey`, which never leaves this device).
 */
export function mergeRemoteIntoLocal(
  table: SyncableTable,
  remoteData: AnyRecord,
  local: AnyRecord | undefined,
): Record<string, unknown> {
  if (table === 'settings' && local?.apiKey != null) {
    return { ...remoteData, apiKey: local.apiKey };
  }
  return { ...remoteData };
}
