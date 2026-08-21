/**
 * `POST /api/ai/structured` — one-shot structured generation on the owner's key.
 *
 * The client sends the prompt and the JSON Schema its zod schema renders to, and
 * gets back the model's JSON as text; it parses and validates with that same zod
 * schema. The server never learns the shape of a diet plan or a recipe, which
 * keeps prompts and schemas co-located per feature (CLAUDE.md) and means a new
 * AI feature needs no server change at all.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { classifyUpstream, runStructured } from '../_lib/anthropic.js';
import { openHostedCall, settleHostedCall } from '../_lib/aiGate.js';
import { guardPost, sendError, sendJson, withErrorHandling } from '../_lib/http.js';
import { aiStructuredSchema, issuePaths, promptSize } from '../_lib/schemas.js';

async function structured(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!guardPost(req, res)) return;

  // Validate before the gate so a malformed body never touches the ledger.
  const parsed = aiStructuredSchema.safeParse(req.body);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'invalid_input', fields: issuePaths(parsed.error) });
    return;
  }
  const { model, maxTokens, system, prompt, schema } = parsed.data;

  const open = await openHostedCall(req, res, {
    model,
    maxTokens,
    promptChars: promptSize(parsed.data),
  });
  if (!open) return;

  try {
    const result = await runStructured(
      { model, maxTokens, system, messages: [{ role: 'user', content: prompt }] },
      schema,
    );
    const credits = await settleHostedCall(open, result.usage);
    sendJson(res, 200, {
      text: result.text,
      stopReason: result.stopReason,
      ...(credits ? { credits } : {}),
    });
  } catch (err) {
    // Nothing usable came back, so nothing is charged — the hold goes home.
    await settleHostedCall(open);
    const { status, code } = classifyUpstream(err);
    sendError(res, status, code);
  }
}

export default withErrorHandling(structured);
