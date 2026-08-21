/**
 * The hosted `LLMClient` — the same interface as `AnthropicClient`, but the call
 * goes to our own `/api/ai/*` instead of `api.anthropic.com`, and it is the
 * owner's key on the far side rather than the user's.
 *
 * Everything above this file is unchanged by that: `useLLMClient` hands features
 * an `LLMClient` and they neither know nor care which one they got. That is the
 * whole point of the provider abstraction — hosted AI is a second implementation
 * of an existing interface, not a second code path through every feature.
 *
 * Two things are deliberately different from the direct client:
 *  - **No API key exists here.** There is nothing to hold, leak, or sync; the
 *    session cookie is httpOnly and this code cannot read it either.
 *  - **Failures come back as codes, not SDK error classes.** The server answers
 *    with stable strings (`insufficient_credits`, `ai_rate_limited`, …) which map
 *    to the same `LLMError` kinds the UI already renders.
 */
import { apiCall, BackendError } from '@/lib/backend/client';
import { logEvent } from '@/lib/telemetry/logEvent';
import { reportError } from '@/lib/telemetry/reportError';
import {
  LLMError,
  type ChatOptions,
  type LLMClient,
  type LLMErrorKind,
  type StructuredOptions,
} from './client';
import { DEFAULT_HOSTED_MODEL, isHostedModel } from './models';

type Op = 'ping' | 'stream' | 'structured';

/**
 * Server code → what the user sees. Anything unlisted is a bug on our side, so
 * it falls through to the generic message *and* gets reported.
 */
const ERRORS: Record<string, { kind: LLMErrorKind; message: string }> = {
  insufficient_credits: {
    kind: 'quota',
    message:
      'You’re out of AI credits for this month. They refresh on the 1st — or add your own API key in Settings for unlimited use.',
  },
  ai_budget_exhausted: {
    kind: 'quota',
    message:
      'Hosted AI is paused for the rest of the month. Add your own API key in Settings to keep generating.',
  },
  email_unverified: {
    kind: 'auth',
    message: 'Confirm your email address to use the built-in AI.',
  },
  unauthenticated: {
    kind: 'auth',
    message: 'Sign in to use the built-in AI, or add your own API key in Settings.',
  },
  hosted_ai_unconfigured: {
    kind: 'auth',
    message: 'Built-in AI isn’t available here. Add your own API key in Settings.',
  },
  ai_rate_limited: {
    kind: 'rate_limit',
    message: 'The AI is busy right now — wait a moment and try again.',
  },
  ai_upstream_unavailable: {
    kind: 'connection',
    message: 'Couldn’t reach the AI service. Try again shortly.',
  },
  ai_upstream_error: {
    kind: 'connection',
    message: 'The AI service returned an error. Try again shortly.',
  },
  ai_bad_request: {
    kind: 'bad_request',
    message: 'The AI rejected that request. Try a shorter prompt.',
  },
  prompt_too_large: {
    kind: 'bad_request',
    message: 'That request is too long. Shorten it and try again.',
  },
  network_unavailable: {
    kind: 'connection',
    message: 'You appear to be offline. Try again when you reconnect.',
  },
  backend_unavailable: {
    kind: 'auth',
    message: 'Built-in AI isn’t available here. Add your own API key in Settings.',
  },
};

/** Being throttled or offline is an operating condition, not a defect (see CLAUDE.md). */
const TRANSIENT_KINDS = new Set<LLMErrorKind>(['rate_limit', 'connection', 'quota']);

function toLLMError(code: string, op: Op): LLMError {
  const known = ERRORS[code];
  const error = known
    ? new LLMError(known.message, known.kind)
    : new LLMError('Unexpected error contacting the AI.', 'unknown');

  if (TRANSIENT_KINDS.has(error.kind)) {
    logEvent('warn', 'llm.error.transient', { op, kind: error.kind, hosted: true });
  } else {
    // `code` is one of our own enum values — no user content in it.
    reportError(error, { where: 'llm', extra: { kind: error.kind, op, code, hosted: true } });
  }
  return error;
}

function fromBackendError(err: unknown, op: Op): LLMError {
  if (err instanceof LLMError) return err;
  if (err instanceof BackendError) return toLLMError(err.code, op);
  if (err instanceof Error && err.name === 'AbortError') {
    logEvent('info', 'llm.call.aborted', { op, hosted: true });
    return new LLMError('Generation cancelled.', 'unknown');
  }
  reportError(err, { where: 'llm', extra: { op, hosted: true } });
  return new LLMError('Unexpected error contacting the AI.', 'unknown');
}

interface CreditsFrame {
  charged: number;
  balance: number;
}

/** Same shape as the direct client's `logCall`, so the two are comparable. */
function logCall(
  op: Op,
  model: string,
  startedAt: number,
  extra: { stopReason?: string | null; credits?: CreditsFrame },
): void {
  logEvent('info', 'llm.call.completed', {
    op,
    model,
    hosted: true,
    durationMs: Date.now() - startedAt,
    stopReason: extra.stopReason ?? undefined,
    creditsCharged: extra.credits?.charged,
    creditsLeft: extra.credits?.balance,
  });
  if (extra.stopReason === 'max_tokens') {
    logEvent('warn', 'llm.call.truncated', { op, model, hosted: true });
  }
}

export class HostedClient implements LLMClient {
  readonly model: string;

  constructor(model?: string) {
    // The proxy only prices a couple of models; asking for another is a settings
    // value from a BYO-key session, not something to fail the request over.
    this.model = isHostedModel(model) ? model : DEFAULT_HOSTED_MODEL;
  }

  async ping(): Promise<string> {
    let reply = '';
    for await (const chunk of this.streamChat({
      messages: [
        {
          role: 'user',
          content: 'Reply with a brief confirmation that the connection works.',
        },
      ],
      maxTokens: 64,
    })) {
      reply += chunk;
    }
    return reply.trim() || 'Connected.';
  }

  async *streamChat(opts: ChatOptions): AsyncIterable<string> {
    const startedAt = Date.now();
    const model = this.pick(opts.model);
    let response: Response;
    try {
      response = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        signal: opts.signal,
        body: JSON.stringify({
          model,
          maxTokens: opts.maxTokens,
          system: opts.system,
          messages: opts.messages,
        }),
      });
    } catch (err) {
      throw fromBackendError(
        err instanceof Error && err.name === 'AbortError'
          ? err
          : new BackendError('network_unavailable', 0),
        'stream',
      );
    }

    // Refusals happen before the first byte, so they are still a status code.
    if (!response.ok || !response.body) {
      throw toLLMError(await errorCode(response), 'stream');
    }

    let stopReason: string | null = null;
    let credits: CreditsFrame | undefined;

    for await (const event of readSse(response.body)) {
      if (event.type === 'delta' && typeof event.text === 'string') {
        yield event.text;
      } else if (event.type === 'error' && typeof event.code === 'string') {
        // Mid-stream failure: the status said 200 long before this was known.
        throw toLLMError(event.code, 'stream');
      } else if (event.type === 'done') {
        stopReason = (event.stopReason as string | null) ?? null;
        credits = event.credits as CreditsFrame | undefined;
      }
    }

    logCall('stream', model, startedAt, { stopReason, credits });
    if (credits) notifyCreditsChanged(credits.balance);
  }

  async generateStructured<T>(opts: StructuredOptions<T>): Promise<T> {
    const startedAt = Date.now();
    const model = this.pick(opts.model);
    let body: {
      text?: string;
      stopReason?: string | null;
      credits?: CreditsFrame;
    };
    try {
      const { status, body: payload } = await apiCall<typeof body & { error?: string }>(
        '/api/ai/structured',
        {
          method: 'POST',
          signal: opts.signal,
          body: JSON.stringify({
            model,
            maxTokens: opts.maxTokens,
            system: opts.system,
            prompt: opts.prompt,
            schema: await toJsonSchema(opts.schema),
          }),
        },
      );
      if (status < 200 || status >= 300) {
        throw toLLMError(payload.error ?? `http_${status}`, 'structured');
      }
      body = payload;
    } catch (err) {
      throw fromBackendError(err, 'structured');
    }

    logCall('structured', model, startedAt, {
      stopReason: body.stopReason,
      credits: body.credits,
    });
    if (body.credits) notifyCreditsChanged(body.credits.balance);

    // Validated here, not on the server: the schema is the feature's, and model
    // output is untrusted wherever it comes from.
    try {
      return opts.schema.parse(JSON.parse(body.text ?? '')) as T;
    } catch {
      throw new LLMError('The AI response did not match the expected format.', 'parse');
    }
  }

  private pick(model?: string): string {
    return isHostedModel(model) ? model : this.model;
  }
}

/** Read the server's error code out of a non-2xx response, whatever it sent. */
async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `http_${response.status}`;
  } catch {
    return `http_${response.status}`;
  }
}

/** Minimal SSE reader — our own endpoint, so only `data:` frames exist. */
async function* readSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown> & { type?: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split = buffer.indexOf('\n\n');
      while (split !== -1) {
        const chunk = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const line = chunk.startsWith('data:') ? chunk.slice(5).trim() : '';
        if (line) {
          try {
            yield JSON.parse(line) as Record<string, unknown>;
          } catch {
            // A truncated frame is a broken connection, not a parse bug worth
            // reporting; the stream simply ends short.
          }
        }
        split = buffer.indexOf('\n\n');
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Render a feature's zod schema to the JSON Schema the API wants.
 *
 * Uses the SDK's own helper rather than a hand-rolled `z.toJSONSchema` call so
 * the result is byte-for-byte what `messages.parse` would have sent — the same
 * `additionalProperties: false` handling, the same treatment of constraints
 * outside the structured-outputs subset. It is a few kB and dynamically
 * imported, so it stays out of the initial bundle like the SDK itself.
 */
async function toJsonSchema(schema: unknown): Promise<Record<string, unknown>> {
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const format = zodOutputFormat(schema as any);
  return format.schema as Record<string, unknown>;
}

/**
 * Credit balances change as a side effect of generating, and the settings card
 * shows them. Rather than have every feature thread a refresh callback through,
 * the client announces the new balance and whoever cares listens.
 */
type CreditsListener = (balance: number) => void;
const listeners = new Set<CreditsListener>();

export function onCreditsChanged(listener: CreditsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyCreditsChanged(balance: number): void {
  for (const listener of listeners) listener(balance);
}
