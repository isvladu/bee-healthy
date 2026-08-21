import { addDays, format } from 'date-fns';
import type { DietDay, DietPlan, Macros } from '@/lib/db/types';

/** Today as the `YYYY-MM-DD` string diet days are keyed by. */
export function isoToday(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

function planEndDate(plan: Pick<DietPlan, 'startDate' | 'days'>): string {
  const start = new Date(`${plan.startDate}T00:00:00`);
  return format(addDays(start, Math.max(0, plan.days.length - 1)), 'yyyy-MM-dd');
}

/**
 * The plan the desktop screens open on. A plan whose date range covers today
 * wins over a newer plan that hasn't started (or already finished) — that's the
 * one the user is actually eating from. `plans` is expected newest-first, as
 * `dietPlanRepo.listByCreatedDesc()` returns it, so the first match is the most
 * recently created of any that qualify.
 */
export function pickActivePlan(
  plans: DietPlan[] | undefined,
  today: string = isoToday(),
): DietPlan | null {
  if (!plans || plans.length === 0) return null;
  const current = plans.find(
    (plan) =>
      plan.days.length > 0 && plan.startDate <= today && planEndDate(plan) >= today,
  );
  return current ?? plans[0];
}

/** Index of the day matching `date`, or 0 when the plan doesn't cover it. */
export function dayIndexForDate(
  plan: Pick<DietPlan, 'days'>,
  date: string = isoToday(),
): number {
  const index = plan.days.findIndex((day) => day.date === date);
  return index >= 0 ? index : 0;
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/**
 * A day's macros. Prefers the stored `totalMacros`, falling back to summing the
 * meals — imported plans routinely have one but not the other, and a day with
 * neither returns null so callers can hide the macro UI instead of drawing zeros.
 */
export function dayTotals(day: DietDay): Macros | null {
  if (day.totalMacros) return day.totalMacros;
  const withMacros = day.meals.filter((meal) => meal.macros);
  if (withMacros.length === 0) return null;
  return withMacros.reduce<Macros>(
    (sum, meal) => ({
      kcal: sum.kcal + (meal.macros?.kcal ?? 0),
      protein: sum.protein + (meal.macros?.protein ?? 0),
      carbs: sum.carbs + (meal.macros?.carbs ?? 0),
      fat: sum.fat + (meal.macros?.fat ?? 0),
    }),
    ZERO,
  );
}

export interface MacroSplit {
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Macro shares of total *energy* (4/4/9 kcal per gram), which is what the
 * stacked bar draws — by grams, fat would look far smaller than it eats.
 * Returns three zeros when there is nothing to split.
 */
export function macroSplit(macros: Macros | null): MacroSplit {
  if (!macros) return { protein: 0, carbs: 0, fat: 0 };
  const p = macros.protein * 4;
  const c = macros.carbs * 4;
  const f = macros.fat * 9;
  const sum = p + c + f;
  if (sum <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: Math.round((p / sum) * 100),
    carbs: Math.round((c / sum) * 100),
    fat: Math.round((f / sum) * 100),
  };
}

/** Average daily protein across days that report macros (0 when none do). */
export function averageDailyProtein(plan: Pick<DietPlan, 'days'>): number {
  const totals = plan.days
    .map((day) => dayTotals(day))
    .filter((macros): macros is Macros => macros != null);
  if (totals.length === 0) return 0;
  return Math.round(totals.reduce((sum, m) => sum + m.protein, 0) / totals.length);
}

/**
 * The "vs target" coach note under the day-total ring. Thresholds mirror the
 * prototype; the target comes from the user's profile rather than a constant.
 */
export function vsTargetNote(dayKcal: number, target: number | null): string {
  if (!target) {
    return 'Add your body stats in Settings and I can tell you how this day sits against your target.';
  }
  const delta = target - dayKcal;
  if (delta < -50) {
    return `${Math.abs(Math.round(delta)).toLocaleString()} kcal above your ${target.toLocaleString()} target — fine as a refeed, worth watching otherwise.`;
  }
  if (delta > 60) {
    return `${Math.round(delta).toLocaleString()} kcal under target — a good deficit for fat loss.`;
  }
  return `Right on your ${target.toLocaleString()} kcal target. 🎯`;
}

/** Lightweight emoji for a meal, matched on its name. */
export function mealEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('breakfast')) return '🥣';
  if (n.includes('lunch')) return '🥗';
  if (n.includes('dinner') || n.includes('supper')) return '🐟';
  if (n.includes('snack') || n.includes('shake')) return '🥤';
  return '🍽️';
}

/** "Chicken breast 180 g" — the ingredient pills on the diet screen. */
export function formatFoodItem(item: {
  name: string;
  quantity?: number;
  unit?: string;
}): string {
  if (item.quantity == null) return item.name;
  const qty = Math.round(item.quantity * 10) / 10;
  return `${item.name} ${qty}${item.unit ? ` ${item.unit}` : ''}`;
}
