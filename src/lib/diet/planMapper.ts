import { addDays, format } from 'date-fns';
import type { DietDay, DietPlan, Macros } from '@/lib/db/types';

/** A DietPlan ready to hand to the repository (base fields are stamped there). */
export type DietPlanDraft = Omit<
  DietPlan,
  'id' | 'createdAt' | 'updatedAt' | 'syncStatus'
>;

// A lenient plan shape that both the API-generated plan (macros required) and an
// imported subscription plan (macros optional) satisfy.
export interface SourceItem {
  name: string;
  quantity?: number;
  unit?: string;
}
export interface SourceMeal {
  name: string;
  items: SourceItem[];
  macros?: Macros;
  note?: string;
}
export interface SourceDay {
  label?: string;
  meals: SourceMeal[];
  totalMacros?: Macros;
  note?: string;
}
export interface SourcePlan {
  title: string;
  summary?: string;
  days: SourceDay[];
}

export interface PlanMapInput {
  generated: SourcePlan;
  startDate: string; // YYYY-MM-DD
  durationDays: number; // total days the plan runs for
  goalPrompt: string;
}

function isoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function mapDay(source: SourceDay, date: string): DietDay {
  return {
    date,
    ...(source.label ? { label: source.label } : {}),
    ...(source.note ? { note: source.note } : {}),
    ...(source.totalMacros ? { totalMacros: source.totalMacros } : {}),
    meals: source.meals.map((meal) => ({
      name: meal.name,
      items: meal.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
      })),
      ...(meal.macros ? { macros: meal.macros } : {}),
      ...(meal.note ? { note: meal.note } : {}),
    })),
  };
}

/**
 * Convert a plan (LLM-generated or imported) into a persistable DietPlan. The
 * source provides a cycle of days (`generated.days`); we tile that cycle across
 * `durationDays`, assigning real calendar dates from `startDate`. Passing
 * `durationDays === generated.days.length` (as imports do) yields the days as-is.
 */
export function toDietPlanDraft({
  generated,
  startDate,
  durationDays,
  goalPrompt,
}: PlanMapInput): DietPlanDraft {
  const start = new Date(`${startDate}T00:00:00`);
  const cycle = generated.days;
  const total = cycle.length === 0 ? 0 : Math.max(0, durationDays);

  const days: DietDay[] = [];
  for (let i = 0; i < total; i++) {
    days.push(mapDay(cycle[i % cycle.length], isoDate(addDays(start, i))));
  }

  return {
    title: generated.title,
    summary: generated.summary,
    startDate,
    durationDays: days.length,
    goalPrompt,
    days,
  };
}

/** Average daily calories across days that have totals (0 when none do). */
export function averageDailyCalories(plan: Pick<DietPlan, 'days'>): number {
  const totals = plan.days
    .map((day) => day.totalMacros?.kcal)
    .filter((kcal): kcal is number => kcal != null);
  if (totals.length === 0) return 0;
  return Math.round(totals.reduce((sum, k) => sum + k, 0) / totals.length);
}
