import {
  LLMError,
  type ChatOptions,
  type LLMClient,
  type LLMConfig,
  type StructuredOptions,
} from './client';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// The Anthropic SDK is heavy (~180 kB gzip). Load it lazily so it stays out of the
// initial bundle — users who never connect a key never download it. Vite splits
// each dynamic import into its own chunk.
type AnthropicModule = typeof import('@anthropic-ai/sdk');
type AnthropicInstance = InstanceType<AnthropicModule['default']>;

let sdkPromise: Promise<AnthropicModule> | null = null;
function loadSdk(): Promise<AnthropicModule> {
  return (sdkPromise ??= import('@anthropic-ai/sdk'));
}

let zodHelperPromise: Promise<typeof import('@anthropic-ai/sdk/helpers/zod')> | null =
  null;
function loadZodHelper() {
  return (zodHelperPromise ??= import('@anthropic-ai/sdk/helpers/zod'));
}

/** Translate Anthropic SDK errors into friendly, categorized LLMErrors. */
export async function mapAnthropicError(err: unknown): Promise<LLMError> {
  if (err instanceof LLMError) return err;
  const Anthropic = (await loadSdk()).default;
  if (err instanceof Anthropic.AuthenticationError)
    return new LLMError('Invalid API key. Double-check it in Settings.', 'auth');
  if (err instanceof Anthropic.PermissionDeniedError)
    return new LLMError('This API key lacks access to that model.', 'auth');
  if (err instanceof Anthropic.RateLimitError)
    return new LLMError('Rate limited — wait a moment and try again.', 'rate_limit');
  if (err instanceof Anthropic.APIConnectionError)
    return new LLMError('Network error — check your connection.', 'connection');
  if (err instanceof Anthropic.BadRequestError)
    return new LLMError(err.message || 'The request was rejected.', 'bad_request');
  if (err instanceof Anthropic.APIError)
    return new LLMError(err.message || 'The AI service returned an error.', 'unknown');
  return new LLMError('Unexpected error contacting the AI.', 'unknown');
}

export class AnthropicClient implements LLMClient {
  readonly model: string;
  private readonly apiKey: string;
  private clientPromise: Promise<AnthropicInstance> | null = null;

  constructor(config: LLMConfig) {
    this.model = config.model || DEFAULT_MODEL;
    this.apiKey = config.apiKey;
  }

  /** Lazily construct the underlying SDK client on first use. */
  private getClient(): Promise<AnthropicInstance> {
    if (!this.clientPromise) {
      this.clientPromise = loadSdk().then(
        (m) =>
          // BYO key: calls go directly from the browser to api.anthropic.com. The
          // SDK sends the `anthropic-dangerous-direct-browser-access` header when
          // this flag is set — intentional for a personal, single-user app.
          new m.default({ apiKey: this.apiKey, dangerouslyAllowBrowser: true }),
      );
    }
    return this.clientPromise;
  }

  async ping(): Promise<string> {
    try {
      const client = await this.getClient();
      const res = await client.messages.create({
        model: this.model,
        max_tokens: 64,
        messages: [
          {
            role: 'user',
            content: 'Reply with a brief confirmation that the connection works.',
          },
        ],
      });
      const block = res.content.find((b) => b.type === 'text');
      return block && block.type === 'text' ? block.text : 'Connected.';
    } catch (err) {
      throw await mapAnthropicError(err);
    }
  }

  async *streamChat(opts: ChatOptions): AsyncIterable<string> {
    let client: AnthropicInstance;
    try {
      client = await this.getClient();
    } catch (err) {
      throw await mapAnthropicError(err);
    }
    try {
      const stream = client.messages.stream(
        {
          model: opts.model ?? this.model,
          max_tokens: opts.maxTokens ?? 4096,
          ...(opts.system ? { system: opts.system } : {}),
          messages: opts.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
        { signal: opts.signal },
      );
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    } catch (err) {
      throw await mapAnthropicError(err);
    }
  }

  async generateStructured<T>(opts: StructuredOptions<T>): Promise<T> {
    try {
      const client = await this.getClient();
      const { zodOutputFormat } = await loadZodHelper();
      const res = await client.messages.parse(
        {
          model: opts.model ?? this.model,
          max_tokens: opts.maxTokens ?? 4096,
          ...(opts.system ? { system: opts.system } : {}),
          messages: [{ role: 'user', content: opts.prompt }],
          output_config: { format: zodOutputFormat(opts.schema) },
        },
        { signal: opts.signal },
      );
      if (res.parsed_output == null) {
        throw new LLMError(
          'The AI response did not match the expected format.',
          'parse',
        );
      }
      return res.parsed_output as T;
    } catch (err) {
      throw await mapAnthropicError(err);
    }
  }
}
