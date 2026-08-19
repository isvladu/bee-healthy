import { logEvent } from '@/lib/telemetry/logEvent';
import { reportError } from '@/lib/telemetry/reportError';
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
  if (!sdkPromise) {
    const startedAt = Date.now();
    sdkPromise = import('@anthropic-ai/sdk').then((mod) => {
      // First real AI action pays for this chunk — worth knowing how long.
      logEvent('info', 'llm.sdk.loaded', { durationMs: Date.now() - startedAt });
      return mod;
    });
  }
  return sdkPromise;
}

let zodHelperPromise: Promise<typeof import('@anthropic-ai/sdk/helpers/zod')> | null =
  null;
function loadZodHelper() {
  return (zodHelperPromise ??= import('@anthropic-ai/sdk/helpers/zod'));
}

type Op = 'ping' | 'stream' | 'structured';

/**
 * Rate limits and dropped connections are operating conditions, not defects:
 * they carry no useful stack, and reporting them burns the 20-error budget that
 * real bugs need. They go to the event channel instead.
 */
const TRANSIENT_KINDS = new Set(['rate_limit', 'connection']);

/** Translate Anthropic SDK errors into friendly, categorized LLMErrors. */
export async function mapAnthropicError(err: unknown, op?: Op): Promise<LLMError> {
  if (err instanceof LLMError) return err; // already mapped and reported
  const mapped = await classifyAnthropicError(err);
  // The user still sees `mapped.message`; this only tells us it happened.
  if (isAbort(err)) {
    // A user-cancelled request isn't a fault — but knowing how often users
    // bail, and how far in, says something about the prompts.
    logEvent('info', 'llm.call.aborted', { op });
  } else if (TRANSIENT_KINDS.has(mapped.kind)) {
    logEvent('warn', 'llm.error.transient', { op, kind: mapped.kind });
  } else {
    reportError(err, { where: 'llm', extra: { kind: mapped.kind, op } });
  }
  return mapped;
}

/**
 * Record how a completed call went. `usage` and `stop_reason` are already on
 * every response — dropping them is how a `max_tokens` truncation ends up
 * looking like the model returned nonsense.
 */
function logCall(
  op: Op,
  model: string,
  startedAt: number,
  res: {
    usage?: { input_tokens?: number; output_tokens?: number } | null;
    stop_reason?: string | null;
  },
  maxTokens?: number,
): void {
  logEvent('info', 'llm.call.completed', {
    op,
    model,
    durationMs: Date.now() - startedAt,
    inputTokens: res.usage?.input_tokens,
    outputTokens: res.usage?.output_tokens,
    stopReason: res.stop_reason ?? undefined,
  });
  if (res.stop_reason === 'max_tokens') {
    // The response is cut off mid-thought; downstream parsing will fail in a
    // way that looks nothing like the actual cause.
    logEvent('warn', 'llm.call.truncated', { op, model, maxTokens });
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'APIUserAbortError');
}

async function classifyAnthropicError(err: unknown): Promise<LLMError> {
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
    if (!config.model) logEvent('info', 'llm.model.defaulted', { model: DEFAULT_MODEL });
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
    const startedAt = Date.now();
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
      logCall('ping', this.model, startedAt, res, 64);
      const block = res.content.find((b) => b.type === 'text');
      return block && block.type === 'text' ? block.text : 'Connected.';
    } catch (err) {
      throw await mapAnthropicError(err, 'ping');
    }
  }

  async *streamChat(opts: ChatOptions): AsyncIterable<string> {
    const startedAt = Date.now();
    const model = opts.model ?? this.model;
    const maxTokens = opts.maxTokens ?? 4096;
    let client: AnthropicInstance;
    try {
      client = await this.getClient();
    } catch (err) {
      throw await mapAnthropicError(err, 'stream');
    }
    try {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: maxTokens,
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
      // Resolves from events the stream already buffered, so this costs nothing
      // and is the only place usage and stop_reason are visible.
      logCall('stream', model, startedAt, await stream.finalMessage(), maxTokens);
    } catch (err) {
      throw await mapAnthropicError(err, 'stream');
    }
  }

  async generateStructured<T>(opts: StructuredOptions<T>): Promise<T> {
    const startedAt = Date.now();
    const model = opts.model ?? this.model;
    const maxTokens = opts.maxTokens ?? 4096;
    try {
      const client = await this.getClient();
      const { zodOutputFormat } = await loadZodHelper();
      const res = await client.messages.parse(
        {
          model,
          max_tokens: maxTokens,
          ...(opts.system ? { system: opts.system } : {}),
          messages: [{ role: 'user', content: opts.prompt }],
          output_config: { format: zodOutputFormat(opts.schema) },
        },
        { signal: opts.signal },
      );
      logCall('structured', model, startedAt, res, maxTokens);
      if (res.parsed_output == null) {
        throw new LLMError(
          'The AI response did not match the expected format.',
          'parse',
        );
      }
      return res.parsed_output as T;
    } catch (err) {
      throw await mapAnthropicError(err, 'structured');
    }
  }
}
