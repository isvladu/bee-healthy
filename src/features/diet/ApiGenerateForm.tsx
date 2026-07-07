import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LLMClient } from '@/lib/llm';
import { LLMError } from '@/lib/llm';
import type { DietPlanDraft } from '@/lib/diet/planMapper';
import { toDietPlanDraft } from '@/lib/diet/planMapper';
import { buildDietPlanPrompt, DIET_SYSTEM_PROMPT } from '@/lib/llm/prompts/diet';
import { GeneratedDietPlanSchema } from '@/lib/llm/schemas/diet';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ApiGenerateForm({
  client,
  goalPrompt,
  uniqueDays,
  totalDays,
  targetCalories,
  savePlan,
}: {
  client: LLMClient | null;
  goalPrompt: string;
  uniqueDays: number;
  totalDays: number;
  targetCalories?: number;
  savePlan: (draft: DietPlanDraft) => Promise<void>;
}) {
  const [status, setStatus] = useState<'idle' | 'generating'>('idle');
  const [error, setError] = useState('');

  if (!client) {
    return (
      <p className="text-sm text-honey-900/70">
        Add your Claude API key in{' '}
        <Link to="/settings" className="font-semibold text-honey-600 underline">
          Settings
        </Link>
        , or use the <strong>Subscription</strong> tab to paste a plan from Claude or
        ChatGPT.
      </p>
    );
  }

  async function handleGenerate() {
    if (!client || !goalPrompt.trim()) {
      setError('Describe your goal first.');
      return;
    }
    setStatus('generating');
    setError('');
    try {
      const generated = await client.generateStructured({
        system: DIET_SYSTEM_PROMPT,
        prompt: buildDietPlanPrompt({
          goalPrompt,
          uniqueDays,
          totalDays,
          targetCalories,
        }),
        schema: GeneratedDietPlanSchema,
        maxTokens: 16000,
      });
      await savePlan(
        toDietPlanDraft({
          generated,
          startDate: todayIso(),
          durationDays: totalDays,
          goalPrompt,
        }),
      );
    } catch (err) {
      setError(
        err instanceof LLMError
          ? err.message
          : 'Could not generate a plan. Try again or reduce the number of days.',
      );
      setStatus('idle');
    }
  }

  const generating = status === 'generating';

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating}
        className="rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98] disabled:opacity-60"
      >
        {generating ? 'Generating… (this can take ~20–40s)' : 'Generate plan'}
      </button>
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
