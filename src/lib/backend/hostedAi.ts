/**
 * Whether the built-in (hosted) AI is usable, and how much of this month's
 * allowance is left.
 *
 * Like the backend itself, this is *discovered* rather than configured:
 * `/api/ai/usage` is the single source of truth, so there is no `VITE_` flag to
 * drift out of step with the server. Every "no" carries a reason, because
 * "you're out of credits" and "confirm your email" need different UI — hiding
 * the feature silently is what we're avoiding.
 *
 * A module-level store rather than per-component fetching: several places want
 * this (the AI settings card, the diet planner, `useLLMClient`) and they should
 * share one request and one balance.
 */
import { apiCall } from './client';
import { onCreditsChanged } from '@/lib/llm';

export type HostedAiReason =
  | 'unconfigured'
  | 'unauthenticated'
  | 'email_unverified'
  | 'budget_exhausted'
  | 'insufficient_credits';

export interface HostedAiState {
  loading: boolean;
  available: boolean;
  reason?: HostedAiReason;
  balance?: number;
  monthlyGrant?: number;
  models?: string[];
  defaultModel?: string;
}

interface UsageResponse {
  available?: boolean;
  reason?: HostedAiReason;
  balance?: number;
  monthlyGrant?: number;
  models?: string[];
  defaultModel?: string;
}

const OFFLINE: HostedAiState = { loading: false, available: false };

let state: HostedAiState = { loading: true, available: false };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function getHostedAi(): HostedAiState {
  return state;
}

export function subscribeHostedAi(listener: () => void): () => void {
  listeners.add(listener);
  // First subscriber triggers the initial load; later ones reuse the result.
  void ensureLoaded();
  return () => listeners.delete(listener);
}

function publish(next: HostedAiState): void {
  state = next;
  for (const listener of listeners) listener();
}

function ensureLoaded(): Promise<void> {
  if (!state.loading && !inFlight) return Promise.resolve();
  return refreshHostedAi();
}

/** Re-read the balance — after signing in, verifying an email, or spending. */
export function refreshHostedAi(): Promise<void> {
  inFlight ??= (async () => {
    try {
      const { status, body } = await apiCall<UsageResponse>('/api/ai/usage');
      if (status !== 200) {
        publish(OFFLINE);
        return;
      }
      publish({
        loading: false,
        available: Boolean(body.available),
        reason: body.reason,
        balance: body.balance,
        monthlyGrant: body.monthlyGrant,
        models: body.models,
        defaultModel: body.defaultModel,
      });
    } catch {
      // Offline, or no `/api` tier at all (`vite dev`). Either way the app falls
      // back to the user's own key — the same graceful degradation as sync.
      publish(OFFLINE);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Keep the displayed balance honest between fetches: every hosted call reports
 * what it charged, so spending is reflected immediately rather than on the next
 * page load.
 */
onCreditsChanged((balance) => {
  if (state.loading) return;
  publish({ ...state, balance, available: balance > 0 });
});
