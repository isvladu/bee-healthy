import { differenceInCalendarDays } from 'date-fns';
import { isoToday } from '@/lib/diet/activePlan';

/**
 * Consecutive days ending today (or yesterday) that have a body-metric entry.
 *
 * The app has no food log, so a check-in streak is the only streak the data
 * actually supports — the nav pill shows this rather than inventing a number.
 * Allowing the run to end *yesterday* means the streak survives until you've
 * missed a full day, which is how every habit tracker behaves.
 */
export function checkInStreak(
  dates: string[] | undefined,
  today: string = isoToday(),
): number {
  if (!dates || dates.length === 0) return 0;

  const unique = Array.from(new Set(dates)).sort().reverse();
  const todayDate = new Date(`${today}T00:00:00`);

  const gapToNewest = differenceInCalendarDays(
    todayDate,
    new Date(`${unique[0]}T00:00:00`),
  );
  if (gapToNewest < 0 || gapToNewest > 1) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const gap = differenceInCalendarDays(
      new Date(`${unique[i - 1]}T00:00:00`),
      new Date(`${unique[i]}T00:00:00`),
    );
    if (gap !== 1) break;
    streak++;
  }
  return streak;
}
