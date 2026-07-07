import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  BodyMetric,
  DietPlan,
  Recipe,
  ShoppingList,
  WorkoutPlan,
  WorkoutSession,
} from './types';

export const SETTINGS_ID = 'app';

export class BeeHealthyDb extends Dexie {
  settings!: Table<AppSettings, string>;
  dietPlans!: Table<DietPlan, string>;
  recipes!: Table<Recipe, string>;
  shoppingLists!: Table<ShoppingList, string>;
  workoutPlans!: Table<WorkoutPlan, string>;
  workoutSessions!: Table<WorkoutSession, string>;
  bodyMetrics!: Table<BodyMetric, string>;

  constructor() {
    super('bee-healthy');

    // Only listed properties are indexed; full objects are stored regardless.
    this.version(1).stores({
      settings: 'id',
      dietPlans: 'id, startDate, createdAt',
      recipes: 'id, createdAt, *tags',
      shoppingLists: 'id, dietPlanId, createdAt',
      workoutPlans: 'id, createdAt',
      workoutSessions: 'id, date, weekIndex, workoutPlanId, createdAt',
      bodyMetrics: 'id, date, createdAt',
    });

    // Seed the settings singleton exactly once, on first DB creation.
    this.on('populate', () => {
      void this.settings.add(defaultSettings());
    });
  }
}

export function defaultSettings(): AppSettings {
  const ts = new Date().toISOString();
  return {
    id: SETTINGS_ID,
    createdAt: ts,
    updatedAt: ts,
    syncStatus: 'pending',
    llmProvider: 'anthropic',
    llmModel: 'claude-sonnet-4-6',
    units: 'metric',
    onboardingComplete: false,
  };
}

export const db = new BeeHealthyDb();
