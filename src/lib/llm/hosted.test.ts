import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { LLMError } from './client';
import { HostedClient, onCreditsChanged } from './hosted';

/** Build a fake SSE response body from the frames the server would send. */
function sseResponse(frames: Record<string, unknown>[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
      controller.close();
    },
  });
  return { ok: status < 400, status, body } as unknown as Response;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function collect(iterable: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of iterable) out += chunk;
  return out;
}

describe('HostedClient — what leaves the browser', () => {
  it('never sends an API key or an auth header', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([{ type: 'delta', text: 'hi' }, { type: 'done' }]),
    );

    await collect(
      new HostedClient().streamChat({
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    // There is no key to send — the owner's lives on the server and the session
    // rides in an httpOnly cookie this code cannot read.
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-api-key')).toBeNull();
    expect(JSON.stringify(init.body)).not.toMatch(/sk-ant/);
    expect(init.credentials).toBe('same-origin');
  });

  it('falls back to a servable model when asked for one the proxy refuses', () => {
    // A settings value left over from a bring-your-own-key session shouldn't
    // fail every request.
    expect(new HostedClient('claude-opus-4-8').model).toBe('claude-sonnet-4-6');
    expect(new HostedClient('claude-haiku-4-5').model).toBe('claude-haiku-4-5');
  });
});

describe('HostedClient.streamChat', () => {
  it('yields the deltas in order', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: 'delta', text: 'Mon' },
        { type: 'delta', text: 'day' },
        { type: 'done', stopReason: 'end_turn' },
      ]),
    );

    expect(
      await collect(
        new HostedClient().streamChat({
          messages: [{ role: 'user', content: 'go' }],
        }),
      ),
    ).toBe('Monday');
  });

  it('turns a refusal before the stream into a friendly error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'insufficient_credits' }, 402),
    );

    const err = await collect(
      new HostedClient().streamChat({ messages: [{ role: 'user', content: 'go' }] }),
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LLMError);
    expect((err as LLMError).kind).toBe('quota');
    expect((err as LLMError).message).toMatch(/credits/i);
  });

  it('turns a mid-stream error frame into the same kind of error', async () => {
    // Once the response has started the status is already 200, so failures can
    // only arrive in-band.
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: 'delta', text: 'partial' },
        { type: 'error', code: 'ai_rate_limited' },
      ]),
    );

    const err = await collect(
      new HostedClient().streamChat({ messages: [{ role: 'user', content: 'go' }] }),
    ).catch((e: unknown) => e);

    expect((err as LLMError).kind).toBe('rate_limit');
  });

  it('announces the new balance so the settings card stays honest', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: 'delta', text: 'x' },
        { type: 'done', credits: { charged: 4, balance: 291 } },
      ]),
    );

    const seen: number[] = [];
    const stop = onCreditsChanged((balance) => seen.push(balance));
    await collect(
      new HostedClient().streamChat({ messages: [{ role: 'user', content: 'go' }] }),
    );
    stop();

    expect(seen).toEqual([291]);
  });
});

describe('HostedClient.generateStructured', () => {
  const schema = z.object({ title: z.string(), days: z.number() });

  it('sends the schema and validates the reply against it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        text: '{"title":"Cutting block","days":7}',
        stopReason: 'end_turn',
        credits: { charged: 6, balance: 294 },
      }),
    );

    const result = await new HostedClient().generateStructured({
      prompt: 'Build a plan',
      schema,
    });

    expect(result).toEqual({ title: 'Cutting block', days: 7 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as { schema: Record<string, unknown> };
    // Rendered from the feature's zod schema, so a new AI feature needs no
    // server change at all.
    expect(sent.schema.type).toBe('object');
    expect(sent.schema.additionalProperties).toBe(false);
  });

  it('treats a reply that does not match the schema as a parse failure', async () => {
    // Model output is untrusted wherever it comes from.
    fetchMock.mockResolvedValue(
      jsonResponse({ text: '{"title":"Cutting block","days":"seven"}' }),
    );

    const err = await new HostedClient()
      .generateStructured({ prompt: 'Build a plan', schema })
      .catch((e: unknown) => e);

    expect((err as LLMError).kind).toBe('parse');
  });

  it('maps an unverified account to an actionable auth error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'email_unverified' }, 403));

    const err = await new HostedClient()
      .generateStructured({ prompt: 'Build a plan', schema })
      .catch((e: unknown) => e);

    expect((err as LLMError).kind).toBe('auth');
    expect((err as LLMError).message).toMatch(/confirm your email/i);
  });

  it('reads being offline as a connection problem, not a bug', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const err = await new HostedClient()
      .generateStructured({ prompt: 'Build a plan', schema })
      .catch((e: unknown) => e);

    expect((err as LLMError).kind).toBe('connection');
  });
});
