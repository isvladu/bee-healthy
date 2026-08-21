import { useSyncExternalStore } from 'react';
import {
  getHostedAi,
  subscribeHostedAi,
  type HostedAiState,
} from '@/lib/backend/hostedAi';

/**
 * Whether the built-in AI is usable for this user, and what's left of their
 * monthly credits. Shared across components — the first mount fetches, the rest
 * read the same snapshot.
 */
export function useHostedAi(): HostedAiState {
  return useSyncExternalStore(subscribeHostedAi, getHostedAi, getHostedAi);
}
