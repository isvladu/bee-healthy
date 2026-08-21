import { AnthropicClient } from './anthropic';
import { HostedClient } from './hosted';
import { LLMError, type LLMClient, type LLMConfig } from './client';

/** Build a provider-specific client from settings. */
export function createLLMClient(config: LLMConfig): LLMClient {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicClient(config);
    case 'openai':
      throw new LLMError(
        'OpenAI support is coming soon — use Anthropic for now.',
        'bad_request',
      );
    default:
      throw new LLMError('Unknown AI provider.', 'bad_request');
  }
}

/**
 * Build a client that calls the model through our backend on the owner's key
 * (Workstream 3). Requires a signed-in, verified account with credits left —
 * `useHostedAi()` is what decides whether to offer it.
 */
export function createHostedClient(model?: string): LLMClient {
  return new HostedClient(model);
}

export { LLMError } from './client';
export type {
  LLMClient,
  LLMConfig,
  LLMErrorKind,
  ChatOptions,
  ChatMessage,
  StructuredOptions,
} from './client';
export { onCreditsChanged } from './hosted';
export {
  ANTHROPIC_MODELS,
  DEFAULT_HOSTED_MODEL,
  HOSTED_MODEL_IDS,
  isHostedModel,
  type ModelOption,
} from './models';
