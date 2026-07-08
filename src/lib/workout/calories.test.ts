import { describe, expect, it } from 'vitest';
import type { WorkoutSession, WorkoutWeek } from '@/lib/db/types';
import { estimateSession, weekKcal, weekVolumeKg } from './calories';

describe('estimateSession', () => {
  it('estimates duration and calories for a strength session', () => {
    const session: WorkoutSession = {
      id: 's1',
      title: 'Push',
      exercises: [
        {
          name: 'Bench press',
          type: 'strength',
          sets: [
            { reps: 8, weightKg: 60 },
            { reps: 8, weightKg: 60 },
            { reps: 8, weightKg: 60 },
          ],
        },
      ],
    };
    // duration = 3 sets × (8×4s + 60s rest) = 276s → 5 min
    // kcal = 5 MET × 75 kg × (276/3600 h) ≈ 28.75 → 29
    const result = estimateSession(session, 75);
    expect(result.durationMin).toBe(5);
    expect(result.estimatedKcal).toBe(29);
  });
});

describe('week aggregates', () => {
  const week: WorkoutWeek = {
    weekIndex: 1,
    sessions: [
      {
        id: 's1',
        exercises: [
          {
            name: 'Squat',
            type: 'strength',
            sets: [
              { reps: 5, weightKg: 100 },
              { reps: 5, weightKg: 100 },
            ],
          },
        ],
        estimatedKcal: 40,
      },
      { id: 's2', exercises: [], estimatedKcal: 10 },
    ],
  };

  it('sums estimated calories', () => {
    expect(weekKcal(week)).toBe(50);
  });

  it('sums strength volume (sets × reps × weight)', () => {
    expect(weekVolumeKg(week)).toBe(1000); // 2 × 5 × 100
  });
});
