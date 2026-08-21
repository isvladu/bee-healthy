import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckBox,
  Chip,
  EmptyState,
  NButton,
  PageHeader,
  StatCard,
} from '@/components/nectar/primitives';
import { cx } from '@/components/nectar/tokens';
import { workoutPlanRepo } from '@/lib/db/repositories';
import { weekKcal, weekVolumeKg } from '@/lib/workout/calories';
import { currentWeekIndex, weekSessionsDone } from '@/lib/workout/blockStats';
import { formatExercise } from '../formatExercise';

export function WorkoutDesktop() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const plans = useLiveQuery(() => workoutPlanRepo.listByCreatedDesc(), []);

  const plan = planId
    ? (plans?.find((candidate) => candidate.id === planId) ?? null)
    : (plans?.[0] ?? null);

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  // Land on the week the user is actually mid-way through, but don't override
  // their selection afterwards.
  useEffect(() => {
    setSelectedWeek(plan ? currentWeekIndex(plan) : null);
  }, [plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (plans === undefined) {
    return <div className="text-[13px] text-ink3">Loading your workouts…</div>;
  }

  if (!plan) {
    return (
      <div>
        <PageHeader title="Workout" />
        <EmptyState emoji="🏋️" title="No workout block yet">
          Paste a program — "Bench press 3x8 @60kg" and friends — and it parses offline
          into weeks and sessions.{' '}
          <Link to="/workout" className="font-semibold text-honeyd">
            Import a workout →
          </Link>
        </EmptyState>
      </div>
    );
  }

  const weekIndex = Math.min(selectedWeek ?? 0, Math.max(0, plan.weeks.length - 1));
  const week = plan.weeks[weekIndex];

  if (!week) {
    return (
      <div>
        <PageHeader title={plan.title} />
        <EmptyState emoji="🗓️" title="This block has no weeks">
          The import didn't find any sessions. Try the raw text again, or use "Parse
          with AI" for a messier format.
        </EmptyState>
      </div>
    );
  }

  const done = weekSessionsDone(week);
  const volume = weekVolumeKg(week);
  const kcal = weekKcal(week);

  return (
    <div>
      <PageHeader
        title={plan.title}
        subtitle={`${plan.weeks.length}-week block · MET-based calorie estimates`}
      >
        <NButton onClick={() => navigate(`/workout/${plan.id}/insights`)}>
          📈 Insights
        </NButton>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-[10px]">
        {plan.weeks.map((candidate, index) => (
          <Chip
            key={candidate.weekIndex}
            active={index === weekIndex}
            onClick={() => setSelectedWeek(index)}
          >
            Week {candidate.weekIndex}
          </Chip>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-[15px]">
        <StatCard
          accent
          label="Sessions done"
          value={done}
          unit={`/${week.sessions.length}`}
        />
        <StatCard
          label="Est. calories"
          value={kcal > 0 ? kcal.toLocaleString() : '—'}
        />
        <StatCard
          label="Volume"
          value={volume > 0 ? volume.toLocaleString() : '—'}
          unit={volume > 0 ? 'kg' : undefined}
        />
      </div>

      <div className="mt-[15px] flex flex-col gap-[11px]">
        {week.sessions.map((session) => {
          const meta = [
            session.durationMin ? `${session.durationMin} min` : null,
            session.estimatedKcal ? `~${session.estimatedKcal} kcal` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <div
              key={session.id}
              className={cx(
                'rounded-[14px] border px-4 py-[14px] transition duration-[120ms]',
                session.completed ? 'border-line2 bg-card2' : 'border-line bg-card',
              )}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-pressed={Boolean(session.completed)}
                  aria-label={`Mark ${session.title ?? 'session'} ${session.completed ? 'not done' : 'done'}`}
                  onClick={() =>
                    workoutPlanRepo.toggleSessionCompleted(plan.id, session.id)
                  }
                  className="cursor-pointer"
                >
                  <CheckBox checked={Boolean(session.completed)} />
                </button>
                <span
                  className={cx(
                    'text-[14.5px] font-bold',
                    session.completed ? 'text-ink3 line-through' : 'text-ink',
                  )}
                >
                  {session.title ?? 'Session'}
                </span>
                {meta && (
                  <span className="ml-auto font-mono text-[11.5px] text-ink3">
                    {meta}
                  </span>
                )}
              </div>

              {session.exercises.length > 0 && (
                <div className="ml-[34px] mt-[11px] grid grid-cols-2 gap-x-[26px] gap-y-[5px]">
                  {session.exercises.map((exercise, index) => (
                    <div
                      key={`${exercise.name}-${index}`}
                      className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-[3px] text-[12.5px]"
                    >
                      <span className="text-ink">{exercise.name}</span>
                      <span className="whitespace-nowrap font-mono text-[11px] text-ink2">
                        {formatExercise(exercise)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
