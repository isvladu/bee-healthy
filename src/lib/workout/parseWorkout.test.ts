import { describe, expect, it } from 'vitest';
import { parseExerciseLine, parseWorkout } from './parseWorkout';

describe('parseExerciseLine', () => {
  it('parses sets, reps, and weight', () => {
    const ex = parseExerciseLine('Bench press 3x8 @60kg');
    expect(ex.name).toBe('Bench press');
    expect(ex.type).toBe('strength');
    expect(ex.sets).toHaveLength(3);
    expect(ex.sets[0]).toEqual({ reps: 8, weightKg: 60 });
  });

  it('converts pounds to kg', () => {
    const ex = parseExerciseLine('Squat 5x5 @135lb');
    expect(ex.sets[0].weightKg).toBeCloseTo(61.235, 2);
  });

  it('parses cardio by duration', () => {
    const ex = parseExerciseLine('Run 30min');
    expect(ex.name).toBe('Run');
    expect(ex.type).toBe('cardio');
    expect(ex.sets[0].durationSec).toBe(1800);
  });
});

describe('parseWorkout', () => {
  const raw = `Week 1
Mon - Push
  Bench press 3x8 @60kg
  Overhead press 3x10 @30kg
Wed - Pull
  Deadlift 3x5 @100kg
  Run 20min`;

  it('parses weeks, sessions, and exercises', () => {
    const parsed = parseWorkout(raw);
    expect(parsed.weeks).toHaveLength(1);
    expect(parsed.weeks[0].weekIndex).toBe(1);

    const [push, pull] = parsed.weeks[0].sessions;
    expect(push.title).toBe('Mon - Push');
    expect(push.exercises).toHaveLength(2);
    expect(push.exercises[0].name).toBe('Bench press');
    expect(push.exercises[0].sets).toHaveLength(3);

    expect(pull.title).toBe('Wed - Pull');
    expect(pull.exercises).toHaveLength(2);
    expect(pull.exercises[1].type).toBe('cardio');
  });

  it('supports multiple weeks', () => {
    const parsed = parseWorkout('Week 1\n Squat 3x5\nWeek 2\n Squat 3x5 @70kg');
    expect(parsed.weeks.map((w) => w.weekIndex)).toEqual([1, 2]);
  });
});
