import type { Exercise, WorkoutSession, WorkoutWeek } from '@/lib/db/types';

// MET (metabolic equivalent) defaults by exercise type. kcal = MET × kg × hours.
const DEFAULT_MET: Record<Exercise['type'], number> = {
  strength: 5, // vigorous resistance training
  cardio: 8, // moderate running/rowing
};

const REST_SEC = 60; // assumed rest between strength sets
const SEC_PER_REP = 4; // assumed tempo per rep

export const DEFAULT_BODY_WEIGHT_KG = 75;

function exerciseDurationSec(exercise: Exercise): number {
  if (exercise.type === 'cardio') {
    return exercise.sets.reduce((sum, set) => sum + (set.durationSec ?? 0), 0);
  }
  return exercise.sets.reduce(
    (sum, set) => sum + ((set.reps ?? 8) * SEC_PER_REP + REST_SEC),
    0,
  );
}

function exerciseKcal(exercise: Exercise, bodyWeightKg: number): number {
  const met = exercise.met ?? DEFAULT_MET[exercise.type];
  return met * bodyWeightKg * (exerciseDurationSec(exercise) / 3600);
}

/** Fill `durationMin` and `estimatedKcal` for a session. */
export function estimateSession(
  session: WorkoutSession,
  bodyWeightKg: number,
): WorkoutSession {
  const totalSec = session.exercises.reduce(
    (sum, ex) => sum + exerciseDurationSec(ex),
    0,
  );
  const kcal = session.exercises.reduce(
    (sum, ex) => sum + exerciseKcal(ex, bodyWeightKg),
    0,
  );
  return {
    ...session,
    durationMin: Math.round(totalSec / 60),
    estimatedKcal: Math.round(kcal),
  };
}

export function estimateWeeks(
  weeks: WorkoutWeek[],
  bodyWeightKg: number,
): WorkoutWeek[] {
  return weeks.map((week) => ({
    ...week,
    sessions: week.sessions.map((session) => estimateSession(session, bodyWeightKg)),
  }));
}

/** Total strength volume for a week (sum of sets × reps × weight). */
export function weekVolumeKg(week: WorkoutWeek): number {
  let volume = 0;
  for (const session of week.sessions) {
    for (const ex of session.exercises) {
      if (ex.type !== 'strength') continue;
      for (const set of ex.sets) {
        volume += (set.reps ?? 0) * (set.weightKg ?? 0);
      }
    }
  }
  return Math.round(volume);
}

export function weekKcal(week: WorkoutWeek): number {
  return week.sessions.reduce((sum, s) => sum + (s.estimatedKcal ?? 0), 0);
}
