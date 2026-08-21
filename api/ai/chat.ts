/**
 * `POST /api/ai/chat` — streaming chat on the owner's key, over SSE.
 *
 * Streaming is not a nicety here: a multi-week diet plan takes tens of seconds
 * to write, and buffering it would give the user a blank screen and put the
 * whole response inside one function timeout. Deltas go out as they arrive, so
 * the hosted experience matches the bring-your-own-key one exactly.
 *
 * Because the response starts before the outcome is known, a failure after the
 * first byte can't be an HTTP status — it arrives as an `error` frame instead.
 * The client maps those to the same `LLMError` kinds it already shows.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { classifyUpstream, runStream } from '../_lib/anthropic.js';
import { openHostedCall, settleHostedCall } from '../_lib/aiGate.js';
import { guardPost, sendJson, withErrorHandling } from '../_lib/http.js';
import type { TokenUsage } from '../_lib/pricing.js';
import { aiChatSchema, issuePaths, promptSize } from '../_lib/schemas.js';

/** Roughly Anthropic's ratio; only used when a real usage report never arrives. */
const CHARS_PER_TOKEN = 4;

function frame(res: VercelResponse, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function chat(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardPost(req, res)) return;

  const parsed = aiChatSchema.safeParse(req.body);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'invalid_input', fields: issuePaths(parsed.error) });
    return;
  }
  const { model, maxTokens, system, messages } = parsed.data;
  const promptChars = promptSize(parsed.data);

  const open = await openHostedCall(req, res, { model, maxTokens, promptChars });
  if (!open) return;

  // A user who navigates away mid-stream should not leave the upstream request
  // (and the owner's money) running.
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  let usage: TokenUsage | undefined;
  let stopReason: string | null = null;
  let streamedChars = 0;
  let failure: unknown;

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    // Stops an intermediate proxy from holding the deltas until the end, which
    // would quietly undo the whole point of this route.
    'x-accel-buffering': 'no',
  });

  try {
    const stream = runStream(
      { model, maxTokens, system, messages },
      (result) => {
        usage = result.usage;
        stopReason = result.stopReason;
      },
      controller.signal,
    );
    for await (const text of stream) {
      streamedChars += text.length;
      frame(res, { type: 'delta', text });
    }
  } catch (err) {
    failure = err;
  }

  // One settle per open, on every path. Tokens already generated were billed
  // upstream whether or not the stream finished, so a partial answer is charged
  // at its estimated cost rather than refunded — otherwise cancelling
  // mid-stream, repeatedly, would be free money out of the owner's pocket.
  const charge =
    usage ??
    (streamedChars > 0 ? estimate(promptChars, streamedChars) : undefined);
  const credits = await settleHostedCall(open, charge);

  if (failure && !controller.signal.aborted) {
    frame(res, { type: 'error', code: classifyUpstream(failure).code });
  } else if (!failure) {
    frame(res, { type: 'done', stopReason, ...(credits ? { credits } : {}) });
  }
  res.end();
}

function estimate(promptChars: number, streamedChars: number): TokenUsage {
  return {
    inputTokens: Math.ceil(promptChars / CHARS_PER_TOKEN),
    outputTokens: Math.ceil(streamedChars / CHARS_PER_TOKEN),
  };
}

export default withErrorHandling(chat);
