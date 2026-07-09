import type { WorkoutPlan, WorkoutWeek } from '@/lib/db/types';
import { weekKcal, weekVolumeKg } from './calories';

export interface WeekStat {
  week: number;
  volume: number;
  kcal: number;
  sessions: number;
}

export function weeklyStats(plan: Pick<WorkoutPlan, 'weeks'>): WeekStat[] {
  return plan.weeks.map((week) => ({
    week: week.weekIndex,
    volume: weekVolumeKg(week),
    kcal: weekKcal(week),
    sessions: week.sessions.length,
  }));
}

/** Epley estimated one-rep max. */
export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

function bestOneRmInWeek(week: WorkoutWeek, name: string): number {
  let best = 0;
  const target = name.toLowerCase();
  for (const session of week.sessions) {
    for (const ex of session.exercises) {
      if (ex.type !== 'strength' || ex.name.toLowerCase() !== target) continue;
      for (const set of ex.sets) {
        if (set.weightKg != null && set.reps != null) {
          best = Math.max(best, epley1RM(set.weightKg, set.reps));
        }
      }
    }
  }
  return Math.round(best);
}

export interface OneRmPoint {
  week: number;
  oneRm: number;
}

export function exercise1RMSeries(
  plan: Pick<WorkoutPlan, 'weeks'>,
  name: string,
): OneRmPoint[] {
  return plan.weeks
    .map((week) => ({ week: week.weekIndex, oneRm: bestOneRmInWeek(week, name) }))
    .filter((point) => point.oneRm > 0);
}

/** Strength exercises (with weight×reps data) ordered by how often they appear. */
export function trackedExercises(plan: Pick<WorkoutPlan, 'weeks'>): string[] {
  const weeksByName = new Map<string, Set<number>>();
  const display = new Map<string, string>();

  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      for (const ex of session.exercises) {
        if (ex.type !== 'strength') continue;
        const hasData = ex.sets.some((s) => s.weightKg != null && s.reps != null);
        if (!hasData) continue;
        const key = ex.name.toLowerCase();
        if (!weeksByName.has(key)) weeksByName.set(key, new Set());
        weeksByName.get(key)!.add(week.weekIndex);
        if (!display.has(key)) display.set(key, ex.name);
      }
    }
  }

  return Array.from(weeksByName.entries())
    .sort((a, b) => b[1].size - a[1].size)
    .map(([key]) => display.get(key)!);
}

/** Compact weekly summary fed to the LLM for improvement tips. */
export function buildInsightsSummary(plan: WorkoutPlan): string {
  const stats = weeklyStats(plan);
  const lines = [`Workout plan: ${plan.title}`];
  for (const stat of stats) {
    lines.push(
      `Week ${stat.week}: ${stat.sessions} sessions, volume ${stat.volume} kg, ~${stat.kcal} kcal`,
    );
  }

  const top = trackedExercises(plan).slice(0, 3);
  for (const name of top) {
    const series = exercise1RMSeries(plan, name);
    if (series.length >= 2) {
      lines.push(
        `${name} est. 1RM by week: ${series.map((p) => `W${p.week} ${p.oneRm}kg`).join(', ')}`,
      );
    }
  }
  return lines.join('\n');
}
