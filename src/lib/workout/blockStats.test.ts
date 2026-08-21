import { describe, expect, it } from 'vitest';
import type { WorkoutSession, WorkoutWeek } from '@/lib/db/types';
import {
  adherencePct,
  compactNumber,
  currentWeekIndex,
  weekSessionsDone,
} from './blockStats';

function session(id: string, completed?: boolean): WorkoutSession {
  return { id, exercises: [], ...(completed ? { completed } : {}) };
}

function week(weekIndex: number, sessions: WorkoutSession[]): WorkoutWeek {
  return { weekIndex, sessions };
}

describe('weekSessionsDone', () => {
  it('counts only completed sessions', () => {
    expect(
      weekSessionsDone(week(1, [session('a', true), session('b'), session('c', true)])),
    ).toBe(2);
  });
});

describe('adherencePct', () => {
  it('is the share of completed sessions across the block', () => {
    const plan = {
      weeks: [
        week(1, [session('a', true), session('b', true)]),
        week(2, [session('c', true), session('d')]),
      ],
    };
    expect(adherencePct(plan)).toBe(75);
  });

  it('is zero for a block with no sessions rather than NaN', () => {
    expect(adherencePct({ weeks: [] })).toBe(0);
    expect(adherencePct({ weeks: [week(1, [])] })).toBe(0);
  });
});

describe('currentWeekIndex', () => {
  it('lands on the first week with sessions still to do', () => {
    const plan = {
      weeks: [
        week(1, [session('a', true)]),
        week(2, [session('b', true), session('c')]),
        week(3, [session('d')]),
      ],
    };
    expect(currentWeekIndex(plan)).toBe(1);
  });

  it('lands on the last week once the block is finished', () => {
    const plan = {
      weeks: [week(1, [session('a', true)]), week(2, [session('b', true)])],
    };
    expect(currentWeekIndex(plan)).toBe(1);
  });

  it('is zero for a plan with no weeks', () => {
    expect(currentWeekIndex({ weeks: [] })).toBe(0);
  });
});

describe('compactNumber', () => {
  it('abbreviates thousands', () => {
    expect(compactNumber(21400)).toEqual({ value: '21.4', unit: 'k' });
    expect(compactNumber(7400)).toEqual({ value: '7.4', unit: 'k' });
  });

  it('leaves smaller numbers alone', () => {
    expect(compactNumber(940)).toEqual({ value: '940', unit: '' });
  });
});
