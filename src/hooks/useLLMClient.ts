import { useMemo } from 'react';
import { createLLMClient, type LLMClient } from '@/lib/llm';
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
    } catch {
      return null;
    }
  }, [apiKey, provider, model]);
}
