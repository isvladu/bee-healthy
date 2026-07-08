import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '@/components/Card';
import { workoutPlanRepo } from '@/lib/db/repositories';
import { weekKcal, weekVolumeKg } from '@/lib/workout/calories';
import { formatExercise } from './formatExercise';

export function WorkoutPlanView() {
  const { planId } = useParams();
  const plan = useLiveQuery(
    () => (planId ? workoutPlanRepo.get(planId) : undefined),
    [planId],
  );
  const [selectedWeek, setSelectedWeek] = useState(0);

  if (plan === undefined) return <Card>Loading…</Card>;
  if (plan === null || plan.weeks.length === 0) {
    return (
      <Card>
        <p className="text-sm text-honey-900/70">
          {plan === null ? 'Workout not found.' : 'This workout has no sessions.'}{' '}
          <Link to="/workout" className="font-semibold text-honey-600 underline">
            Back to workouts
          </Link>
        </p>
      </Card>
    );
  }

  const weekIndex = Math.min(selectedWeek, plan.weeks.length - 1);
  const week = plan.weeks[weekIndex];
  const completed = week.sessions.filter((s) => s.completed).length;

  return (
    <section className="space-y-4">
      <div>
        <Link to="/workout" className="text-sm font-medium text-honey-600">
          ← All workouts
        </Link>
        <h2 className="mt-1 text-xl font-bold text-honey-800">{plan.title}</h2>
      </div>

      {/* Week selector */}
      {plan.weeks.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {plan.weeks.map((w, i) => (
            <button
              key={w.weekIndex}
              type="button"
              onClick={() => setSelectedWeek(i)}
              className={[
                'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                i === weekIndex
                  ? 'bg-honey-500 text-white'
                  : 'bg-white text-honey-700 hover:bg-honey-100',
              ].join(' ')}
            >
              Week {w.weekIndex}
            </button>
          ))}
        </div>
      )}

      {/* Week summary */}
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <Stat label="Sessions done" value={`${completed}/${week.sessions.length}`} />
        <Stat label="Est. calories" value={`~${weekKcal(week).toLocaleString()}`} />
        <Stat label="Volume" value={`${weekVolumeKg(week).toLocaleString()} kg`} />
      </Card>

      {/* Sessions */}
      {week.sessions.map((session) => (
        <Card key={session.id} className="space-y-2">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={session.completed ?? false}
              onChange={() => workoutPlanRepo.toggleSessionCompleted(plan.id, session.id)}
              className="mt-1 h-5 w-5 shrink-0 accent-honey-500"
              aria-label="Mark session done"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={
                    session.completed
                      ? 'font-semibold text-honey-900/40 line-through'
                      : 'font-semibold text-honey-800'
                  }
                >
                  {session.title ?? 'Session'}
                </span>
                <span className="text-xs text-honey-900/50">
                  {session.durationMin ? `${session.durationMin} min · ` : ''}~
                  {session.estimatedKcal ?? 0} kcal
                </span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {session.exercises.map((exercise, i) => (
                  <li
                    key={i}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="text-honey-900/80">{exercise.name}</span>
                    <span className="shrink-0 text-honey-900/50">
                      {formatExercise(exercise)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ))}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-honey-900/50">
        {label}
      </div>
      <div className="text-lg font-bold text-honey-700">{value}</div>
    </div>
  );
}
