import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Field, NumberInput, Segmented, TextInput } from '@/components/form';
import { useLLMClient } from '@/hooks/useLLMClient';
import { useSettings } from '@/hooks/useSettings';
import { dietPlanRepo, settingsRepo } from '@/lib/db/repositories';
import type { AppSettings } from '@/lib/db/types';
import type { DietPlanDraft } from '@/lib/diet/planMapper';
import type { LLMClient } from '@/lib/llm';
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
  const client = useLLMClient();
  const settings = useSettings();

  if (!settings) {
    return (
      <Card>
        <p className="text-sm text-honey-900/60">Loading…</p>
      </Card>
    );
  }
  return <PlannerForm settings={settings} client={client} />;
}

function PlannerForm({
  settings,
  client,
}: {
  settings: AppSettings;
  client: LLMClient | null;
}) {
  const navigate = useNavigate();

  const [goalPrompt, setGoalPrompt] = useState('');
  const [daysInput, setDaysInput] = useState('7');
  const [country, setCountry] = useState(settings.country ?? '');
  const [avoid, setAvoid] = useState(settings.dietaryExclusions ?? '');
  const [method, setMethod] = useState<Method>('api');

  const totalDays = clampDays(Number.parseInt(daysInput, 10));
  const uniqueDays = Math.min(totalDays, MAX_CYCLE_DAYS);

  const targetCalories =
    computeEnergy({
      sex: settings.sex,
      age: settings.age,
      heightCm: settings.heightCm,
      weightKg: settings.weightKg,
      activityLevel: settings.activityLevel,
      goal: settings.goal,
    })?.target ?? undefined;

  // Remember diet preferences for next time (fire-and-forget).
  function persistPrefs() {
    void settingsRepo.update({
      country: country.trim() || undefined,
      dietaryExclusions: avoid.trim() || undefined,
    });
  }

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
        label="Allergies & foods to avoid"
        hint="We'll never include these — allergies and dislikes."
      >
        <textarea
          value={avoid}
          onChange={(e) => setAvoid(e.target.value)}
          onBlur={persistPrefs}
          rows={2}
          placeholder="e.g. peanuts, shellfish, cilantro, pork"
          className="w-full rounded-xl border border-honey-200 bg-white px-3 py-2 text-honey-900 outline-none transition focus:border-honey-400 focus:ring-2 focus:ring-honey-200"
        />
      </Field>

      <Field
        label="Country you live in"
        hint="So we skip ingredients that are hard to find where you are."
      >
        <TextInput
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          onBlur={persistPrefs}
          placeholder="e.g. Romania"
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
          country={country}
          avoid={avoid}
          onBeforeAction={persistPrefs}
          savePlan={savePlan}
        />
      ) : (
        <SubscriptionImportForm
          goalPrompt={goalPrompt}
          totalDays={totalDays}
          targetCalories={targetCalories}
          country={country}
          avoid={avoid}
          onBeforeAction={persistPrefs}
          savePlan={savePlan}
        />
      )}
    </Card>
  );
}
