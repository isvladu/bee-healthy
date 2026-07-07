import { AnthropicClient } from './anthropic';
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

export { LLMError } from './client';
export type {
  LLMClient,
  LLMConfig,
  LLMErrorKind,
  ChatOptions,
  ChatMessage,
  StructuredOptions,
} from './client';
export { ANTHROPIC_MODELS, type ModelOption } from './models';
