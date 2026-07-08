import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { workoutPlanRepo } from './workoutPlanRepo';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function draft() {
  return {
    title: 'Test workout',
    rawInput: 'Week 1\n Squat 3x5',
    weeks: [
      {
        weekIndex: 1,
        sessions: [
          { id: 'sess-1', title: 'Legs', exercises: [], completed: false },
        ],
      },
    ],
  };
}

describe('workoutPlanRepo', () => {
  it('toggles session completion and persists it', async () => {
    const created = await workoutPlanRepo.create(draft());

    await workoutPlanRepo.toggleSessionCompleted(created.id, 'sess-1');
    let plan = await workoutPlanRepo.get(created.id);
    expect(plan?.weeks[0].sessions[0].completed).toBe(true);

    await workoutPlanRepo.toggleSessionCompleted(created.id, 'sess-1');
    plan = await workoutPlanRepo.get(created.id);
    expect(plan?.weeks[0].sessions[0].completed).toBe(false);
  });
});
