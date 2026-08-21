/**
 * The server's only handle on the Anthropic API.
 *
 * The mirror image of `src/lib/llm/anthropic.ts`: that one is constructed with
 * the *user's* key in their browser, this one with the *owner's* key on the
 * server. Nothing outside this file may import `@anthropic-ai/sdk` under
 * `api/`, for the same reason nothing outside `src/lib/llm/` may in the client
 * — one place to reason about which key is in play.
 *
 * Deliberately thin: it takes an already-validated request, runs it, and hands
 * back text plus token usage. Quota, pricing, and the spend ceiling live in
 * `credits.ts` / `pricing.ts`, so this module has no opinion about who is
 * allowed to call it.
 */
import Anthropic from '@anthropic-ai/sdk';
import { anthropicKey } from './env.js';
import type { TokenUsage } from './pricing.js';

let cached: Anthropic | null = null;
let cachedFor = '';

function client(): Anthropic {
  const key = anthropicKey();
  if (!cached || cachedFor !== key) {
    cached = new Anthropic({ apiKey: key });
    cachedFor = key;
  }
  return cached;
}

/** Test seam — drops the memoized client. */
export function resetAnthropicClient(): void {
  cached = null;
  cachedFor = '';
}

export interface ProxyMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProxyRequest {
  model: string;
  maxTokens: number;
  system?: string;
  messages: ProxyMessage[];
}

export interface ProxyResult {
  text: string;
  usage: TokenUsage;
  stopReason: string | null;
}

function readUsage(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): TokenUsage {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  };
}

function joinText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * One-shot call constrained to a JSON Schema. The schema arrives from the
 * client (its zod schema, rendered by the SDK's own helper) and the client
 * validates the reply against that same zod schema — the server never needs to
 * know the shape, which keeps prompts and schemas co-located per feature.
 */
export async function runStructured(
  request: ProxyRequest,
  schema: Record<string, unknown>,
): Promise<ProxyResult> {
  const response = await client().messages.create({
    model: request.model,
    max_tokens: request.maxTokens,
    ...(request.system ? { system: request.system } : {}),
    messages: request.messages,
    output_config: { format: { type: 'json_schema', schema } },
  });
  return {
    text: joinText(response.content),
    usage: readUsage(response.usage),
    stopReason: response.stop_reason ?? null,
  };
}

export interface StreamChunk {
  text: string;
}

/**
 * Streaming chat. Yields text deltas, then resolves `usage` from the buffered
 * final message — which is how the caller learns what to charge. The generator
 * hands the usage back through `onComplete` rather than a return value so a
 * `for await` consumer cannot accidentally drop it.
 */
export async function* runStream(
  request: ProxyRequest,
  onComplete: (result: Omit<ProxyResult, 'text'>) => void,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const stream = client().messages.stream(
    {
      model: request.model,
      max_tokens: request.maxTokens,
      ...(request.system ? { system: request.system } : {}),
      messages: request.messages,
    },
    { signal },
  );

  try {
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    onComplete({
      usage: readUsage(final.usage),
      stopReason: final.stop_reason ?? null,
    });
  } finally {
    // A client that hangs up mid-stream must not leave the upstream request
    // running on the owner's key.
    stream.abort();
  }
}

/**
 * Map an SDK error to a stable code the browser already understands, plus the
 * HTTP status to answer with. Upstream messages are not forwarded: they can
 * carry request ids and account details that are ours, not the user's.
 */
export function classifyUpstream(err: unknown): { status: number; code: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    // Our key, not theirs — nothing the user can do, and it is an outage for us.
    return { status: 503, code: 'ai_upstream_unavailable' };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { status: 503, code: 'ai_upstream_unavailable' };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, code: 'ai_rate_limited' };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, code: 'ai_upstream_unavailable' };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, code: 'ai_bad_request' };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, code: 'ai_upstream_error' };
  }
  return { status: 500, code: 'internal_error' };
}
