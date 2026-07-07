import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { Card } from '@/components/Card';
import { useLLMClient } from '@/hooks/useLLMClient';
import { dietPlanRepo } from '@/lib/db/repositories';
import { averageDailyCalories } from '@/lib/diet/planMapper';
import { LLMError } from '@/lib/llm';
import { buildCoachTipsMessages } from '@/lib/llm/prompts/diet';
import { MacroSummary } from './components/MacroSummary';

function prettyDate(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), 'EEE, MMM d');
}

export function DietPlanView() {
  const { planId } = useParams();
  const plan = useLiveQuery(
    () => (planId ? dietPlanRepo.get(planId) : undefined),
    [planId],
  );
  const client = useLLMClient();

  const [selectedDay, setSelectedDay] = useState(0);
  const [tips, setTips] = useState('');
  const [tipsState, setTipsState] = useState<'idle' | 'streaming' | 'error'>('idle');
  const [tipsError, setTipsError] = useState('');

  if (plan === undefined) {
    return <Card>Loading…</Card>;
  }
  if (plan === null || plan.days.length === 0) {
    return (
      <Card>
        <p className="text-sm text-honey-900/70">
          {plan === null ? 'Plan not found.' : 'This plan has no days.'}{' '}
          <Link to="/diet" className="font-semibold text-honey-600 underline">
            Back to plans
          </Link>
        </p>
      </Card>
    );
  }

  const dayIndex = Math.min(selectedDay, plan.days.length - 1);
  const day = plan.days[dayIndex];
  const avg = averageDailyCalories(plan);

  async function loadTips() {
    if (!client || !plan) return;
    setTips('');
    setTipsError('');
    setTipsState('streaming');
    try {
      const { system, messages } = buildCoachTipsMessages(
        plan.title,
        plan.summary ?? plan.goalPrompt ?? '',
      );
      for await (const chunk of client.streamChat({
        system,
        messages,
        maxTokens: 1024,
      })) {
        setTips((prev) => prev + chunk);
      }
      setTipsState('idle');
    } catch (err) {
      setTipsError(err instanceof LLMError ? err.message : 'Could not load tips.');
      setTipsState('error');
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <Link to="/diet" className="text-sm font-medium text-honey-600">
          ← All plans
        </Link>
        <h2 className="mt-1 text-xl font-bold text-honey-800">{plan.title}</h2>
        <p className="text-sm text-honey-900/60">
          {plan.durationDays} days · from {prettyDate(plan.startDate)}
          {avg > 0 && ` · avg ${avg.toLocaleString()} kcal/day`}
        </p>
      </div>

      {plan.summary && (
        <Card>
          <p className="text-sm text-honey-900/70">{plan.summary}</p>
        </Card>
      )}

      {/* Day selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {plan.days.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelectedDay(i)}
            className={[
              'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              i === dayIndex
                ? 'bg-honey-500 text-white'
                : 'bg-white text-honey-700 hover:bg-honey-100',
            ].join(' ')}
          >
            Day {i + 1}
          </button>
        ))}
      </div>

      {/* Selected day */}
      <Card className="space-y-4">
        <div>
          <h3 className="font-semibold text-honey-800">
            Day {dayIndex + 1} · {prettyDate(day.date)}
          </h3>
          {day.label && (
            <p className="text-sm font-medium text-honey-600">{day.label}</p>
          )}
          {day.note && <p className="text-sm text-honey-900/60">{day.note}</p>}
        </div>

        {day.meals.map((meal, mi) => (
          <div
            key={mi}
            className="border-t border-honey-100 pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-honey-800">{meal.name}</span>
              {meal.macros && <MacroSummary macros={meal.macros} />}
            </div>
            <ul className="mt-1 space-y-0.5">
              {meal.items.map((item, ii) => (
                <li key={ii} className="text-sm text-honey-900/70">
                  {item.name}
                  {item.quantity != null && (
                    <span className="text-honey-900/50">
                      {' '}
                      — {item.quantity}
                      {item.unit ? ` ${item.unit}` : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {meal.note && (
              <p className="mt-1 text-xs italic text-honey-900/50">{meal.note}</p>
            )}
          </div>
        ))}

        <div className="border-t border-honey-200 pt-3">
          <div className="text-xs font-medium uppercase tracking-wide text-honey-900/50">
            Day total
          </div>
          {day.totalMacros ? (
            <MacroSummary macros={day.totalMacros} size="lg" />
          ) : (
            <p className="text-sm text-honey-900/50">Macros not specified.</p>
          )}
        </div>
      </Card>

      {/* Streaming coach tips */}
      {client && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-honey-800">Coach tips</h3>
            <button
              type="button"
              onClick={loadTips}
              disabled={tipsState === 'streaming'}
              className="rounded-lg border border-honey-300 px-3 py-1.5 text-sm font-medium text-honey-700 transition hover:bg-honey-100 disabled:opacity-60"
            >
              {tipsState === 'streaming' ? 'Thinking…' : 'Get tips'}
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
