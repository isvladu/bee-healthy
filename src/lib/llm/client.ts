// Import from `zod/v4` so schema types are identical to what the Anthropic SDK's
// `zodOutputFormat` helper expects. Feature schemas must also import from `zod/v4`.
import type { z } from 'zod/v4';
import type { LLMProvider } from '@/lib/db/types';

export type LLMErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'connection'
  | 'bad_request'
  | 'parse'
  | 'unknown';

/** A user-facing error with a friendly message and a coarse category. */
export class LLMError extends Error {
  constructor(
    message: string,
    readonly kind: LLMErrorKind,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  system?: string;
  model?: string; // overrides the client's default model
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface StructuredOptions<T> {
  prompt: string;
  schema: z.ZodType<T>;
  system?: string;
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Provider-agnostic LLM surface. Implementations live per-provider. */
export interface LLMClient {
  readonly model: string;
  /** Cheap round-trip used to validate the key/model from Settings. */
  ping(): Promise<string>;
  /** Streaming free-form chat (diet-planning conversation). */
  streamChat(opts: ChatOptions): AsyncIterable<string>;
  /** One-shot structured extraction validated against a zod schema. */
  generateStructured<T>(opts: StructuredOptions<T>): Promise<T>;
}

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
}
