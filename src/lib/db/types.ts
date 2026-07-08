// Domain types shared across the app. Records stored in Dexie extend BaseRecord.

export type SyncStatus = 'synced' | 'pending' | 'conflict';

export interface BaseRecord {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  syncStatus: SyncStatus;
}

export type Units = 'metric' | 'imperial';
export type Sex = 'male' | 'female' | 'other';
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';
export type LLMProvider = 'anthropic' | 'openai';

/** Singleton app settings (id === 'app'). `apiKey` stays on-device and is never synced. */
export interface AppSettings extends BaseRecord {
  llmProvider: LLMProvider;
  llmModel: string;
  apiKey?: string;
  units: Units;
  // Current body stats (stored in metric internally).
  sex?: Sex;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  activityLevel?: ActivityLevel;
  goal?: Goal;
  // Diet preferences, remembered across plans.
  country?: string;
  dietaryExclusions?: string; // allergies / disliked foods to never include
  onboardingComplete: boolean;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodItem {
  name: string;
  quantity?: number;
  unit?: string;
  macros?: Macros;
}

export interface Meal {
  name: string;
  items: FoodItem[];
  macros?: Macros; // optional — imported plans may omit macros
  note?: string;
}

export interface DietDay {
  date: string;
  label?: string; // e.g. "Monday — Gym (AM)"
  meals: Meal[];
  totalMacros?: Macros;
  note?: string;
}

export interface DietPlan extends BaseRecord {
  title: string;
  summary?: string;
  startDate: string;
  durationDays: number;
  goalPrompt?: string;
  days: DietDay[];
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  checked: boolean;
  sourceRecipeId?: string;
}

export interface ShoppingList extends BaseRecord {
  dietPlanId?: string;
  title: string;
  items: ShoppingItem[];
}

export interface Recipe extends BaseRecord {
  title: string;
  description?: string;
  ingredients: FoodItem[];
  steps: string[];
  servings: number;
  macrosPerServing?: Macros;
  notes?: string;
  tags: string[];
  source?: string;
}

export type ExerciseType = 'strength' | 'cardio';

export interface ExerciseSet {
  reps?: number;
  weightKg?: number;
  restSec?: number;
  durationSec?: number;
}

export interface Exercise {
  name: string;
  type: ExerciseType;
  sets: ExerciseSet[];
  met?: number;
}

export interface WorkoutSession extends BaseRecord {
  workoutPlanId?: string;
  date: string;
  weekIndex: number;
  title?: string;
  exercises: Exercise[];
  durationMin?: number;
  estimatedKcal?: number;
}

export interface WorkoutWeek {
  weekIndex: number;
  sessionIds: string[];
}

export interface WorkoutPlan extends BaseRecord {
  title: string;
  rawInput: string;
  weeks: WorkoutWeek[];
}

export interface BodyMetric extends BaseRecord {
  date: string; // YYYY-MM-DD
  weightKg?: number;
  bodyFatPct?: number;
  note?: string;
}
