import { useMemo } from 'react';
import { createHostedClient, createLLMClient, type LLMClient } from '@/lib/llm';
import { logEvent } from '@/lib/telemetry/logEvent';
import { useHostedAi } from './useHostedAi';
import { useSettings } from './useSettings';

/**
 * Returns a configured LLM client, or null when there is no way to reach a model.
 *
 * A personal API key always wins: it is unlimited, the user is paying for it, and
 * it can use models the hosted proxy won't serve. Only when there is no key do we
 * fall back to the hosted client, and only when the server says this account can
 * actually use it (signed in, verified, credits left) — otherwise features would
 * offer a button that always fails.
 */
export function useLLMClient(): LLMClient | null {
  const settings = useSettings();
  const hosted = useHostedAi();

  const apiKey = settings?.apiKey;
  const provider = settings?.llmProvider;
  const model = settings?.llmModel;
  const hostedAvailable = hosted.available;
  const hostedDefault = hosted.defaultModel;

  return useMemo(() => {
    if (apiKey && provider && model) {
      try {
        return createLLMClient({ provider, model, apiKey });
      } catch (err) {
        // Returning null hides every AI button in the UI with no explanation, so
        // this is the only trace that the app entered its degraded mode.
        logEvent('warn', 'llm.client.unavailable', {
          provider,
          model,
          reason: err instanceof Error ? err.message : typeof err,
        });
        return null;
      }
    }
    if (hostedAvailable) {
      // The saved model may be one the proxy won't serve (Opus); the hosted
      // client falls back to the default rather than failing the request.
      return createHostedClient(model ?? hostedDefault);
    }
    return null;
  }, [apiKey, provider, model, hostedAvailable, hostedDefault]);
}
