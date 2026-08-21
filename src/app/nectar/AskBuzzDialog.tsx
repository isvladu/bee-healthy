import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { NButton } from '@/components/nectar/primitives';
import { cx } from '@/components/nectar/tokens';
import { useLLMClient } from '@/hooks/useLLMClient';
import { LLMError } from '@/lib/llm';
import { BuzzGlyph } from './icons';

const SYSTEM_PROMPT = `You are Buzz, the in-app coach for Bee Healthy, a diet and workout tracking app.
Answer in plain prose, at most 150 words, no markdown headings.
Be concrete and practical about nutrition and training. If a question needs
information you were not given, say what you'd need rather than inventing it.`;

/**
 * "Ask Buzz anything" — the coach panel's one live LLM surface. Streams through
 * the same `LLMClient` every other feature uses, so it works on a personal key
 * or hosted credits without caring which it got.
 */
export function AskBuzzDialog({
  context,
  initialPrompt,
  onClose,
}: {
  /** A short summary of the user's real plan state, prepended to the question. */
  context: string;
  initialPrompt?: string;
  onClose: () => void;
}) {
  const client = useLLMClient();
  const [question, setQuestion] = useState(initialPrompt ?? '');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<'idle' | 'streaming'>('idle');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // A dialog that unmounts mid-stream must not leave the request running.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function ask() {
    const trimmed = question.trim();
    if (!client || !trimmed || status === 'streaming') return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('streaming');
    setError('');
    setAnswer('');
    try {
      const stream = client.streamChat({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `${context}\n\nQuestion: ${trimmed}` }],
        maxTokens: 1024,
        signal: controller.signal,
      });
      for await (const chunk of stream) {
        setAnswer((current) => current + chunk);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      // `mapAnthropicError` has already reported anything worth reporting.
      setError(
        err instanceof LLMError
          ? err.message
          : 'Something went wrong reaching the model.',
      );
    } finally {
      if (!controller.signal.aborted) setStatus('idle');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask Buzz"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-[560px] flex-col gap-4 rounded-[16px] border border-line bg-card p-5 font-ui shadow-[0_24px_60px_-20px_rgba(20,12,0,.6)]"
      >
        <div className="flex items-center gap-[10px]">
          <div className="flex size-[38px] flex-none items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_35%,#ffd36b,#f5a114)] shadow-[0_4px_12px_-5px_rgba(245,161,20,.9)]">
            <BuzzGlyph size={24} />
          </div>
          <div>
            <div className="font-display text-[15px] font-bold text-ink">Ask Buzz</div>
            <div className="text-[11px] text-ink3">
              {client ? `Your AI coach · ${client.model}` : 'No model connected'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto cursor-pointer text-[18px] leading-none text-ink3 hover:text-ink"
          >
            ×
          </button>
        </div>

        {!client ? (
          <p className="text-[13px] leading-[1.55] text-ink2">
            Buzz needs a model to talk to. Add your Anthropic API key — or sign in and
            verify your email to use hosted AI — in{' '}
            <Link
              to="/settings"
              onClick={onClose}
              className="font-semibold text-honeyd"
            >
              Settings
            </Link>
            .
          </p>
        ) : (
          <>
            <textarea
              ref={inputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  void ask();
                }
              }}
              rows={3}
              placeholder="How should I adjust tomorrow if I miss today's protein target?"
              className="w-full resize-none rounded-[11px] border border-line2 bg-card2 px-3 py-[10px] text-[13.5px] text-ink outline-0 placeholder:text-ink3 focus:border-honey"
            />

            {(answer || status === 'streaming') && (
              <div className="min-h-[60px] overflow-auto whitespace-pre-wrap rounded-[11px] border border-line bg-card2 p-3 text-[13px] leading-[1.55] text-ink">
                {answer}
                {status === 'streaming' && (
                  <span className="ml-[2px] inline-block animate-pulse">▍</span>
                )}
              </div>
            )}

            {error && <p className="text-[12.5px] text-terra">{error}</p>}

            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto text-[11px] text-ink3">⌘↵ to send</span>
              <NButton type="button" onClick={onClose}>
                Close
              </NButton>
              <NButton
                type="button"
                variant="primary"
                onClick={() => void ask()}
                disabled={status === 'streaming' || question.trim().length === 0}
                className={cx(status === 'streaming' && 'opacity-70')}
              >
                {status === 'streaming' ? 'Thinking…' : '✨ Ask'}
              </NButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
