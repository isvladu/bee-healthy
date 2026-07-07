import { db } from '../schema';
import type { DietPlan } from '../types';
import { Repository } from './base';

class DietPlanRepository extends Repository<DietPlan> {
  /** Most recently created plans first, for the plan list. */
  listByCreatedDesc(): Promise<DietPlan[]> {
    return this.table.orderBy('createdAt').reverse().toArray();
  }
}

export const dietPlanRepo = new DietPlanRepository(db.dietPlans);
