import { useState } from 'react';
import type { DietPlanDraft } from '@/lib/diet/planMapper';
import { toDietPlanDraft } from '@/lib/diet/planMapper';
import { buildSubscriptionPrompt } from '@/lib/llm/prompts/diet';
import { parseImportedDietPlan } from '@/lib/llm/schemas/dietImport';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SubscriptionImportForm({
  goalPrompt,
  totalDays,
  targetCalories,
  savePlan,
}: {
  goalPrompt: string;
  totalDays: number;
  targetCalories?: number;
  savePlan: (draft: DietPlanDraft) => Promise<void>;
}) {
  const [pasted, setPasted] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const promptText = buildSubscriptionPrompt({
    goalPrompt: goalPrompt.trim() || '(describe your goal above)',
    uniqueDays: totalDays,
    totalDays,
    targetCalories,
  });

  async function handleCopy() {
    if (!goalPrompt.trim()) {
      setError('Describe your goal above first.');
      return;
    }
    setError('');
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — select the prompt below and copy it manually.');
    }
  }

  async function handleImport() {
    setError('');
    setImporting(true);
    try {
      const parsed = parseImportedDietPlan(pasted);
      await savePlan(
        toDietPlanDraft({
          generated: parsed,
          startDate: todayIso(),
          durationDays: parsed.days.length,
          goalPrompt,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that text.');
      setImporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-honey-900/70">
        <li>Copy the prompt below.</li>
        <li>Paste it into your Claude or ChatGPT app and send.</li>
        <li>Copy the assistant's reply and paste it here, then Import.</li>
      </ol>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98]"
        >
          Copy prompt
        </button>
        {copied && (
          <span className="text-sm font-medium text-green-600" role="status">
            Copied ✓
          </span>
        )}
      </div>

      <details className="rounded-xl border border-honey-100 bg-honey-50/50 p-2">
        <summary className="cursor-pointer text-sm font-medium text-honey-700">
          Preview prompt
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-honey-900/70">
          {promptText}
        </pre>
      </details>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-honey-800">
          Paste the assistant's reply
        </span>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={5}
          placeholder="Paste the JSON reply from Claude / ChatGPT here…"
          className="w-full rounded-xl border border-honey-200 bg-white px-3 py-2 font-mono text-xs text-honey-900 outline-none transition focus:border-honey-400 focus:ring-2 focus:ring-honey-200"
        />
      </label>

      <button
        type="button"
        onClick={handleImport}
        disabled={importing || pasted.trim() === ''}
        className="rounded-xl border border-honey-300 px-4 py-2 font-semibold text-honey-700 transition hover:bg-honey-100 disabled:opacity-60"
      >
        {importing ? 'Importing…' : 'Import plan'}
      </button>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
