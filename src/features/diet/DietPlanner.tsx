import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Field, NumberInput, Segmented } from '@/components/form';
import { useLLMClient } from '@/hooks/useLLMClient';
import { useSettings } from '@/hooks/useSettings';
import { dietPlanRepo } from '@/lib/db/repositories';
import type { DietPlanDraft } from '@/lib/diet/planMapper';
import { computeEnergy } from '@/lib/nutrition/energy';
import { ApiGenerateForm } from './ApiGenerateForm';
import { SubscriptionImportForm } from './SubscriptionImportForm';

const MIN_DAYS = 3;
const MAX_DAYS = 60; // up to ~2 months
const MAX_CYCLE_DAYS = 14; // distinct days generated in one API call; longer plans rotate

type Method = 'api' | 'subscription';

function clampDays(n: number): number {
  if (!Number.isFinite(n)) return 7;
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(n)));
}

export function DietPlanner() {
  const navigate = useNavigate();
  const client = useLLMClient();
  const settings = useSettings();

  const [goalPrompt, setGoalPrompt] = useState('');
  const [daysInput, setDaysInput] = useState('7');
  const [method, setMethod] = useState<Method>('api');

  const totalDays = clampDays(Number.parseInt(daysInput, 10));
  const uniqueDays = Math.min(totalDays, MAX_CYCLE_DAYS);

  const targetCalories =
    computeEnergy({
      sex: settings?.sex,
      age: settings?.age,
      heightCm: settings?.heightCm,
      weightKg: settings?.weightKg,
      activityLevel: settings?.activityLevel,
      goal: settings?.goal,
    })?.target ?? undefined;

  async function savePlan(draft: DietPlanDraft) {
    const plan = await dietPlanRepo.create(draft);
    navigate(`/diet/${plan.id}`);
  }

  return (
    <Card className="space-y-4">
      <h3 className="font-semibold text-honey-800">New diet plan</h3>

      <Field
        label="What do you want?"
        hint="e.g. “2-week high-protein cut, no dairy, quick lunches”"
      >
        <textarea
          value={goalPrompt}
          onChange={(e) => setGoalPrompt(e.target.value)}
          rows={3}
          placeholder="Describe your goal, preferences, and any restrictions…"
          className="w-full rounded-xl border border-honey-200 bg-white px-3 py-2 text-honey-900 outline-none transition focus:border-honey-400 focus:ring-2 focus:ring-honey-200"
        />
      </Field>

      <Field
        label="Length (days)"
        hint={
          method === 'api' && totalDays > MAX_CYCLE_DAYS
            ? `Meals rotate on a ${MAX_CYCLE_DAYS}-day cycle across the ${totalDays} days.`
            : `${MIN_DAYS}–${MAX_DAYS} days`
        }
      >
        <NumberInput
          value={daysInput}
          min={MIN_DAYS}
          max={MAX_DAYS}
          step={1}
          onChange={(e) => setDaysInput(e.target.value)}
          onBlur={() => setDaysInput(String(totalDays))}
        />
      </Field>

      <div>
        <Segmented<Method>
          value={method}
          onChange={setMethod}
          options={[
            { value: 'api', label: 'API key' },
            { value: 'subscription', label: 'Claude / ChatGPT' },
          ]}
        />
        <p className="mt-1 text-xs text-honey-900/50">
          {method === 'api'
            ? 'Generate instantly with your saved API key.'
            : 'No API key needed — use your Claude or ChatGPT subscription.'}
        </p>
      </div>

      {method === 'api' ? (
        <ApiGenerateForm
          client={client}
          goalPrompt={goalPrompt}
          uniqueDays={uniqueDays}
          totalDays={totalDays}
          targetCalories={targetCalories}
          savePlan={savePlan}
        />
      ) : (
        <SubscriptionImportForm
          goalPrompt={goalPrompt}
          totalDays={totalDays}
          targetCalories={targetCalories}
          savePlan={savePlan}
        />
      )}
    </Card>
  );
}
