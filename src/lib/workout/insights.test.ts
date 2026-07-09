import { describe, expect, it } from 'vitest';
import type { WorkoutPlan } from '@/lib/db/types';
import {
  buildInsightsSummary,
  epley1RM,
  exercise1RMSeries,
  trackedExercises,
  weeklyStats,
} from './insights';

function makePlan(): WorkoutPlan {
  return {
    id: 'p1',
    createdAt: '',
    updatedAt: '',
    syncStatus: 'pending',
    title: 'Split',
    rawInput: '',
    weeks: [
      {
        weekIndex: 1,
        sessions: [
          {
            id: 's1',
            title: 'Legs',
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
            estimatedKcal: 50,
          },
        ],
      },
      {
        weekIndex: 2,
        sessions: [
          {
            id: 's2',
            title: 'Legs',
            exercises: [
              {
                name: 'Squat',
                type: 'strength',
                sets: [{ reps: 5, weightKg: 110 }],
              },
            ],
            estimatedKcal: 30,
          },
        ],
      },
    ],
  };
}

describe('epley1RM', () => {
  it('applies the Epley formula', () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.667, 2);
    expect(epley1RM(0, 5)).toBe(0);
  });
});

describe('weeklyStats', () => {
  it('summarizes volume, calories, and sessions per week', () => {
    const stats = weeklyStats(makePlan());
    expect(stats[0]).toEqual({ week: 1, volume: 1000, kcal: 50, sessions: 1 });
    expect(stats[1].volume).toBe(550); // 1 × 5 × 110
  });
});

describe('exercise1RMSeries + trackedExercises', () => {
  it('tracks estimated 1RM across weeks', () => {
    const plan = makePlan();
    expect(trackedExercises(plan)).toContain('Squat');
    const series = exercise1RMSeries(plan, 'Squat');
    expect(series).toEqual([
      { week: 1, oneRm: 117 },
      { week: 2, oneRm: 128 },
    ]);
  });
});

describe('buildInsightsSummary', () => {
  it('includes weekly lines and 1RM progression', () => {
    const summary = buildInsightsSummary(makePlan());
    expect(summary).toContain('Week 1: 1 sessions, volume 1000 kg');
    expect(summary).toContain('Squat est. 1RM by week: W1 117kg, W2 128kg');
  });
});
