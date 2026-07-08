import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '@/components/Card';
import { Field, TextInput } from '@/components/form';
import { useLLMClient } from '@/hooks/useLLMClient';
import { useSettings } from '@/hooks/useSettings';
import { workoutPlanRepo } from '@/lib/db/repositories';
import { LLMError } from '@/lib/llm';
import { buildWorkoutParsePrompt, WORKOUT_SYSTEM_PROMPT } from '@/lib/llm/prompts/workout';
import { ParsedWorkoutSchema } from '@/lib/llm/schemas/workout';
import { fromAiWorkout } from '@/lib/workout/aiMapper';
import { DEFAULT_BODY_WEIGHT_KG, estimateWeeks, weekKcal } from '@/lib/workout/calories';
import { parseWorkout, type ParsedWorkout } from '@/lib/workout/parseWorkout';

const EXAMPLE = `Week 1
Mon - Push
  Bench press 3x8 @60kg
  Overhead press 3x10 @30kg
Wed - Pull
  Deadlift 3x5 @100kg
  Run 20min`;

export function WorkoutPage() {
  const navigate = useNavigate();
  const client = useLLMClient();
  const settings = useSettings();
  const plans = useLiveQuery(() => workoutPlanRepo.listByCreatedDesc(), []);

  const [raw, setRaw] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'parsing'>('idle');
  const [error, setError] = useState('');

  const bodyWeight = settings?.weightKg ?? DEFAULT_BODY_WEIGHT_KG;

  async function importPlan(parsed: ParsedWorkout) {
    const hasExercises = parsed.weeks.some((w) =>
      w.sessions.some((s) => s.exercises.length > 0),
    );
    if (!hasExercises) {
      setError('Could not find any exercises — check the format and try again.');
      setStatus('idle');
      return;
    }
    const weeks = estimateWeeks(parsed.weeks, bodyWeight);
    const plan = await workoutPlanRepo.create({
      title: name.trim() || parsed.title,
      rawInput: raw,
      weeks,
    });
    navigate(`/workout/${plan.id}`);
  }

  function handleLocalImport() {
    if (!raw.trim()) {
      setError('Paste your workout first.');
      return;
    }
    setError('');
    void importPlan(parseWorkout(raw));
  }

  async function handleAiImport() {
    if (!client || !raw.trim()) {
      setError('Paste your workout first.');
      return;
    }
    setStatus('parsing');
    setError('');
    try {
      const ai = await client.generateStructured({
        system: WORKOUT_SYSTEM_PROMPT,
        prompt: buildWorkoutParsePrompt(raw),
        schema: ParsedWorkoutSchema,
        maxTokens: 4000,
      });
      await importPlan(fromAiWorkout(ai));
    } catch (err) {
      setError(err instanceof LLMError ? err.message : 'AI parsing failed.');
      setStatus('idle');
    }
  }

  const parsing = status === 'parsing';

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-honey-800">Workout</h2>
        <p className="mt-1 text-sm text-honey-900/60">
          Paste a workout in plain text — it's parsed into weeks and sessions with
          estimated calories.
        </p>
      </div>

      <Card className="space-y-4">
        <h3 className="font-semibold text-honey-800">Import workout</h3>

        <Field label="Name (optional)">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 5-day split"
          />
        </Field>

        <Field label="Paste your workout" hint="Weeks, days, and exercises like “3x8 @60kg”.">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={8}
            placeholder={EXAMPLE}
            className="w-full rounded-xl border border-honey-200 bg-white px-3 py-2 font-mono text-xs text-honey-900 outline-none transition focus:border-honey-400 focus:ring-2 focus:ring-honey-200"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleLocalImport}
            disabled={parsing}
            className="rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98] disabled:opacity-60"
          >
            Import
          </button>
          {client && (
            <button
              type="button"
              onClick={handleAiImport}
              disabled={parsing}
              className="rounded-xl border border-honey-300 px-4 py-2 font-semibold text-honey-700 transition hover:bg-honey-100 disabled:opacity-60"
            >
              {parsing ? 'Parsing…' : 'Parse with AI'}
            </button>
          )}
        </div>
        <p className="text-xs text-honey-900/50">
          “Import” parses locally and instantly. “Parse with AI” handles messier
          formats using your API key.
        </p>

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </Card>

      {plans && plans.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-honey-900/60">Your workouts</h3>
          {plans.map((plan) => {
            const totalKcal = plan.weeks.reduce((sum, w) => sum + weekKcal(w), 0);
            return (
              <Link key={plan.id} to={`/workout/${plan.id}`} className="block">
                <Card className="transition active:scale-[0.99]">
                  <div className="font-semibold text-honey-800">{plan.title}</div>
                  <div className="mt-0.5 text-xs text-honey-900/50">
                    {plan.weeks.length} week{plan.weeks.length === 1 ? '' : 's'} · ~
                    {totalKcal.toLocaleString()} kcal total
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
