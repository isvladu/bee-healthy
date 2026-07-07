import { useLiveQuery } from 'dexie-react-hooks';
import { settingsRepo } from '@/lib/db/repositories';
import type { AppSettings } from '@/lib/db/types';

/**
 * Live settings. Returns `undefined` on the first render before the DB resolves,
 * so callers should handle the loading state.
 */
export function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => settingsRepo.getOrCreate(), []);
}
