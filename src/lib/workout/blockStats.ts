import type { WorkoutPlan, WorkoutWeek } from '@/lib/db/types';

/** Sessions the user has ticked off in a week. */
export function weekSessionsDone(week: WorkoutWeek): number {
  return week.sessions.filter((session) => session.completed).length;
}

/** Completed sessions across the whole block, as a percentage (0 when empty). */
export function adherencePct(plan: Pick<WorkoutPlan, 'weeks'>): number {
  let total = 0;
  let done = 0;
  for (const week of plan.weeks) {
    total += week.sessions.length;
    done += weekSessionsDone(week);
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Index of the week the user is most likely looking at: the first incomplete
 *  one, falling back to the last week when the block is finished. */
export function currentWeekIndex(plan: Pick<WorkoutPlan, 'weeks'>): number {
  if (plan.weeks.length === 0) return 0;
  const index = plan.weeks.findIndex(
    (week) => weekSessionsDone(week) < week.sessions.length,
  );
  return index >= 0 ? index : plan.weeks.length - 1;
}

/** Compact big numbers the way the stat tiles show them: 21400 → "21.4k". */
export function compactNumber(value: number): { value: string; unit: string } {
  if (Math.abs(value) >= 1000) {
    return { value: (Math.round(value / 100) / 10).toString(), unit: 'k' };
  }
  return { value: Math.round(value).toLocaleString(), unit: '' };
}
