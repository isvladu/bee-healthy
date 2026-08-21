import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '@/hooks/useSettings';
import { dietPlanRepo, recipeRepo, workoutPlanRepo } from '@/lib/db/repositories';
import type { Recipe } from '@/lib/db/types';
import {
  averageDailyProtein,
  dayIndexForDate,
  dayTotals,
  isoToday,
  pickActivePlan,
} from '@/lib/diet/activePlan';
import { averageDailyCalories } from '@/lib/diet/planMapper';
import { computeEnergy } from '@/lib/nutrition/energy';
import { currentWeekIndex, weekSessionsDone } from '@/lib/workout/blockStats';

export interface CoachStats {
  /** Sessions ticked off / planned in the workout block's current week. */
  workouts: { done: number; total: number } | null;
  avgProtein: number | null;
  kcalAdherence: number | null;
  mealIdea: { title: string; detail: string } | null;
  /** One-line state summary handed to the model when the user asks Buzz. */
  llmContext: string;
}

function pickMealIdea(
  recipes: Recipe[] | undefined,
): { title: string; detail: string } | null {
  const withMacros = (recipes ?? []).filter((r) => r.macrosPerServing != null);
  if (withMacros.length === 0) return null;
  // The highest-protein saved recipe is the one worth surfacing on a cut.
  const best = withMacros.reduce((a, b) =>
    (b.macrosPerServing?.protein ?? 0) > (a.macrosPerServing?.protein ?? 0) ? b : a,
  );
  const macros = best.macrosPerServing!;
  return {
    title: best.title,
    detail: `${Math.round(macros.protein)}g protein and ${Math.round(macros.kcal).toLocaleString()} kcal per serving — one of the strongest picks in your cookbook.`,
  };
}

/**
 * Everything the Buzz panel shows, derived from Dexie rather than the
 * prototype's hardcoded 3/5 · 178g · 94%. Any figure the data can't support
 * comes back null so the panel drops that row instead of guessing.
 */
export function useCoachStats(): CoachStats {
  const settings = useSettings();
  const dietPlans = useLiveQuery(() => dietPlanRepo.listByCreatedDesc(), []);
  const workoutPlans = useLiveQuery(() => workoutPlanRepo.listByCreatedDesc(), []);
  const recipes = useLiveQuery(() => recipeRepo.listByCreatedDesc(), []);

  const plan = pickActivePlan(dietPlans);
  const workoutPlan = workoutPlans?.[0] ?? null;

  const target = settings
    ? (computeEnergy({
        sex: settings.sex,
        age: settings.age,
        heightCm: settings.heightCm,
        weightKg: settings.weightKg,
        activityLevel: settings.activityLevel,
        goal: settings.goal,
      })?.target ?? null)
    : null;

  const avgKcal = plan ? averageDailyCalories(plan) : 0;
  const avgProtein = plan ? averageDailyProtein(plan) : 0;

  const week =
    workoutPlan && workoutPlan.weeks.length > 0
      ? workoutPlan.weeks[currentWeekIndex(workoutPlan)]
      : null;

  const today = isoToday();
  const todayDay = plan ? plan.days[dayIndexForDate(plan, today)] : null;
  const todayMacros = todayDay ? dayTotals(todayDay) : null;

  const contextLines = [
    'Context about this user (from their local app data):',
    plan
      ? `Active diet plan "${plan.title}", ${plan.days.length} days, avg ${avgKcal || '?'} kcal/day, avg ${avgProtein || '?'}g protein/day.`
      : 'No diet plan saved yet.',
    todayMacros
      ? `Today's plan: ${Math.round(todayMacros.kcal)} kcal, P ${Math.round(todayMacros.protein)}g / C ${Math.round(todayMacros.carbs)}g / F ${Math.round(todayMacros.fat)}g.`
      : null,
    target ? `Daily calorie target from their profile: ${target} kcal.` : null,
    workoutPlan
      ? `Workout block "${workoutPlan.title}", ${workoutPlan.weeks.length} weeks${
          week
            ? `, currently week ${week.weekIndex} (${weekSessionsDone(week)}/${week.sessions.length} sessions done)`
            : ''
        }.`
      : 'No workout plan saved yet.',
  ].filter(Boolean);

  return {
    workouts: week
      ? { done: weekSessionsDone(week), total: week.sessions.length }
      : null,
    avgProtein: avgProtein > 0 ? avgProtein : null,
    kcalAdherence: target && avgKcal > 0 ? Math.round((avgKcal / target) * 100) : null,
    mealIdea: pickMealIdea(recipes),
    llmContext: contextLines.join('\n'),
  };
}
