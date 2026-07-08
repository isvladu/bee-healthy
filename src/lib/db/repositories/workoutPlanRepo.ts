import { db } from '../schema';
import type { WorkoutPlan } from '../types';
import { Repository } from './base';

class WorkoutPlanRepository extends Repository<WorkoutPlan> {
  listByCreatedDesc(): Promise<WorkoutPlan[]> {
    return this.table.orderBy('createdAt').reverse().toArray();
  }

  /** Toggle a session's completed flag (week-by-week logging). */
  async toggleSessionCompleted(id: string, sessionId: string): Promise<void> {
    const plan = await this.get(id);
    if (!plan) return;
    const weeks = plan.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, completed: !session.completed }
          : session,
      ),
    }));
    await this.update(id, { weeks });
  }
}

export const workoutPlanRepo = new WorkoutPlanRepository(db.workoutPlans);
