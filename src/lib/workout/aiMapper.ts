import type { Exercise, WorkoutWeek } from '@/lib/db/types';
import type { ParsedWorkoutAI } from '@/lib/llm/schemas/workout';
import { logEvent } from '@/lib/telemetry/logEvent';
import type { ParsedWorkout } from './parseWorkout';

/**
 * The AI schema uses 0 as "not applicable", so every field can arrive unusable.
 * `repairs` counts how often we had to patch one — a high count means the model
 * is returning junk and the prompt or schema needs work.
 */
function toExercise(
  ai: ParsedWorkoutAI['weeks'][number]['sessions'][number]['exercises'][number],
  repairs: { count: number },
): Exercise {
  if (ai.type === 'cardio') {
    if (!(ai.durationMin > 0)) repairs.count++;
    return {
      name: ai.name,
      type: 'cardio',
      sets: [{ durationSec: ai.durationMin > 0 ? ai.durationMin * 60 : undefined }],
    };
  }
  if (!(ai.reps > 0)) repairs.count++;
  if (!(ai.weightKg > 0)) repairs.count++;
  if (!(ai.sets > 0)) repairs.count++;
  const set = {
    reps: ai.reps > 0 ? ai.reps : undefined,
    weightKg: ai.weightKg > 0 ? ai.weightKg : undefined,
  };
  const count = ai.sets > 0 ? ai.sets : 1;
  return {
    name: ai.name,
    type: 'strength',
    sets: Array.from({ length: count }, () => ({ ...set })),
  };
}

/** Convert the flat AI parse result into the shared ParsedWorkout shape. */
export function fromAiWorkout(ai: ParsedWorkoutAI): ParsedWorkout {
  const repairs = { count: 0 };
  const weeks: WorkoutWeek[] = ai.weeks
    .map((week) => {
      if (!(week.weekNumber > 0)) repairs.count++;
      return {
        weekIndex: week.weekNumber > 0 ? week.weekNumber : 1,
        sessions: week.sessions.map((session) => ({
          id: crypto.randomUUID(),
          title: session.title || undefined,
          exercises: session.exercises.map((exercise) =>
            toExercise(exercise, repairs),
          ),
        })),
      };
    })
    .sort((a, b) => a.weekIndex - b.weekIndex);

  if (repairs.count > 0) {
    logEvent('warn', 'workout.ai.repaired', { repairs: repairs.count });
  }
  return { title: ai.title || 'Imported workout', weeks };
}
