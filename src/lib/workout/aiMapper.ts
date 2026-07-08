import type { Exercise, WorkoutWeek } from '@/lib/db/types';
import type { ParsedWorkoutAI } from '@/lib/llm/schemas/workout';
import type { ParsedWorkout } from './parseWorkout';

function toExercise(ai: ParsedWorkoutAI['weeks'][number]['sessions'][number]['exercises'][number]): Exercise {
  if (ai.type === 'cardio') {
    return {
      name: ai.name,
      type: 'cardio',
      sets: [{ durationSec: ai.durationMin > 0 ? ai.durationMin * 60 : undefined }],
    };
  }
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
  const weeks: WorkoutWeek[] = ai.weeks
    .map((week) => ({
      weekIndex: week.weekNumber > 0 ? week.weekNumber : 1,
      sessions: week.sessions.map((session) => ({
        id: crypto.randomUUID(),
        title: session.title || undefined,
        exercises: session.exercises.map(toExercise),
      })),
    }))
    .sort((a, b) => a.weekIndex - b.weekIndex);

  return { title: ai.title || 'Imported workout', weeks };
}
