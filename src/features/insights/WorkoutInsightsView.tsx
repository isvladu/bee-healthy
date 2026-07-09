import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '@/components/Card';
import { Select } from '@/components/form';
import { useLLMClient } from '@/hooks/useLLMClient';
import { workoutPlanRepo } from '@/lib/db/repositories';
import { LLMError } from '@/lib/llm';
import { buildInsightsMessages } from '@/lib/llm/prompts/workout';
import {
  buildInsightsSummary,
  exercise1RMSeries,
  trackedExercises,
  weeklyStats,
} from '@/lib/workout/insights';
import { OneRepMaxChart, WeeklyProgressChart } from './charts';

export function WorkoutInsightsView() {
  const { planId } = useParams();
  const plan = useLiveQuery(
    () => (planId ? workoutPlanRepo.get(planId) : undefined),
    [planId],
  );
  const client = useLLMClient();

  const exercises = plan ? trackedExercises(plan) : [];
  const [selectedExercise, setSelectedExercise] = useState('');
  const [tips, setTips] = useState('');
  const [tipsState, setTipsState] = useState<'idle' | 'streaming' | 'error'>('idle');
  const [tipsError, setTipsError] = useState('');

  if (plan === undefined) return <Card>Loading…</Card>;
  if (plan === null || plan.weeks.length === 0) {
    return (
      <Card>
        <p className="text-sm text-honey-900/70">
          Workout not found.{' '}
          <Link to="/workout" className="font-semibold text-honey-600 underline">
            Back to workouts
          </Link>
        </p>
      </Card>
    );
  }

  const stats = weeklyStats(plan);
  const currentExercise = selectedExercise || exercises[0] || '';
  const oneRmSeries = currentExercise ? exercise1RMSeries(plan, currentExercise) : [];

  async function loadTips() {
    if (!client || !plan) return;
    setTips('');
    setTipsError('');
    setTipsState('streaming');
    try {
      const { system, messages } = buildInsightsMessages(buildInsightsSummary(plan));
      for await (const chunk of client.streamChat({ system, messages, maxTokens: 1024 })) {
        setTips((prev) => prev + chunk);
      }
      setTipsState('idle');
    } catch (err) {
      setTipsError(err instanceof LLMError ? err.message : 'Could not load insights.');
      setTipsState('error');
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <Link
          to={`/workout/${plan.id}`}
          className="text-sm font-medium text-honey-600"
        >
          ← {plan.title}
        </Link>
        <h2 className="mt-1 text-xl font-bold text-honey-800">Insights</h2>
      </div>

      {plan.weeks.length < 2 && (
        <Card>
          <p className="text-sm text-honey-900/60">
            This workout has one week. Import a multi-week plan to see week-over-week
            trends.
          </p>
        </Card>
      )}

      <Card className="space-y-2">
        <h3 className="font-semibold text-honey-800">Weekly volume & calories</h3>
        <WeeklyProgressChart data={stats} />
      </Card>

      {oneRmSeries.length > 0 && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-honey-800">Estimated 1RM</h3>
            {exercises.length > 1 && (
              <div className="max-w-[55%]">
                <Select
                  value={currentExercise}
                  onChange={(e) => setSelectedExercise(e.target.value)}
                >
                  {exercises.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <OneRepMaxChart data={oneRmSeries} />
        </Card>
      )}

      {client && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-honey-800">Coach insights</h3>
            <button
              type="button"
              onClick={loadTips}
              disabled={tipsState === 'streaming'}
              className="rounded-lg border border-honey-300 px-3 py-1.5 text-sm font-medium text-honey-700 transition hover:bg-honey-100 disabled:opacity-60"
            >
              {tipsState === 'streaming' ? 'Analyzing…' : 'Get insights'}
            </button>
          </div>
          {tips && (
            <p className="whitespace-pre-wrap text-sm text-honey-900/80">{tips}</p>
          )}
          {tipsState === 'error' && (
            <p className="text-sm text-red-700" role="alert">
              {tipsError}
            </p>
          )}
        </Card>
      )}
    </section>
  );
}
