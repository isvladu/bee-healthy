import type { Exercise } from '@/lib/db/types';

/** Human-readable summary of an exercise, e.g. "3 × 8 @ 60 kg" or "30 min". */
export function formatExercise(exercise: Exercise): string {
  if (exercise.type === 'cardio') {
    const parts: string[] = [];
    const durationSec = exercise.sets.reduce((s, set) => s + (set.durationSec ?? 0), 0);
    const distanceKm = exercise.sets.reduce((s, set) => s + (set.distanceKm ?? 0), 0);
    if (durationSec > 0) parts.push(`${Math.round(durationSec / 60)} min`);
    if (distanceKm > 0) parts.push(`${Math.round(distanceKm * 100) / 100} km`);
    return parts.join(' · ') || 'cardio';
  }

  const count = exercise.sets.length;
  const first = exercise.sets[0];
  if (!first || first.reps == null) {
    return count > 0 ? `${count} set${count > 1 ? 's' : ''}` : '';
  }
  const weight =
    first.weightKg != null ? ` @ ${Math.round(first.weightKg * 10) / 10} kg` : '';
  return `${count} × ${first.reps}${weight}`;
}
