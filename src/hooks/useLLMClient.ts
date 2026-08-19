import { useMemo } from 'react';
import { createLLMClient, type LLMClient } from '@/lib/llm';
import { logEvent } from '@/lib/telemetry/logEvent';
import { useSettings } from './useSettings';

/** Returns a configured LLM client, or null when no API key is set. */
export function useLLMClient(): LLMClient | null {
  const settings = useSettings();
  const apiKey = settings?.apiKey;
  const provider = settings?.llmProvider;
  const model = settings?.llmModel;

  return useMemo(() => {
    if (!apiKey || !provider || !model) return null;
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
  }, [apiKey, provider, model]);
}
