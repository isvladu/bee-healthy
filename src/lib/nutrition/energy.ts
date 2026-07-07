import type { ActivityLevel, Goal, Sex } from '@/lib/db/types';

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Simple kcal deltas applied to maintenance for the chosen goal. */
const GOAL_DELTAS: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (little/no exercise)',
  light: 'Light (1–3 days/week)',
  moderate: 'Moderate (3–5 days/week)',
  active: 'Active (6–7 days/week)',
  very_active: 'Very active (physical job / 2x day)',
};

export const GOAL_LABELS: Record<Goal, string> = {
  lose: 'Lose weight',
  maintain: 'Maintain',
  gain: 'Gain muscle',
};

export interface EnergyInputs {
  sex?: Sex;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  activityLevel?: ActivityLevel;
  goal?: Goal;
}

export interface EnergyResult {
  bmr: number; // basal metabolic rate
  tdee: number; // maintenance calories
  target: number; // goal-adjusted daily target
}

/** Mifflin–St Jeor equation. For 'other', use the midpoint of the male/female constants. */
export function bmrMifflinStJeor(
  sex: Sex,
  age: number,
  heightCm: number,
  weightKg: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const sexAdjustment = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return base + sexAdjustment;
}

/** Returns null when any required input is missing or non-positive. */
export function computeEnergy(input: EnergyInputs): EnergyResult | null {
  const { sex, age, heightCm, weightKg, activityLevel, goal } = input;
  if (
    sex == null ||
    age == null ||
    heightCm == null ||
    weightKg == null ||
    activityLevel == null ||
    goal == null
  ) {
    return null;
  }
  if (age <= 0 || heightCm <= 0 || weightKg <= 0) return null;

  const bmr = bmrMifflinStJeor(sex, age, heightCm, weightKg);
  const tdee = bmr * ACTIVITY_FACTORS[activityLevel];
  const target = tdee + GOAL_DELTAS[goal];

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    target: Math.round(target),
  };
}
