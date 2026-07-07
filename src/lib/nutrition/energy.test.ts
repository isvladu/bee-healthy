import { describe, expect, it } from 'vitest';
import { bmrMifflinStJeor, computeEnergy } from './energy';

describe('bmrMifflinStJeor', () => {
  it('matches the known value for a male', () => {
    // 80kg, 180cm, 30y male → 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(bmrMifflinStJeor('male', 30, 180, 80)).toBe(1780);
  });

  it('applies the female constant', () => {
    // 65kg, 165cm, 30y female → 650 + 1031.25 - 150 - 161 = 1370.25
    expect(bmrMifflinStJeor('female', 30, 165, 65)).toBeCloseTo(1370.25);
  });
});

describe('computeEnergy', () => {
  it('returns null when inputs are incomplete', () => {
    expect(computeEnergy({ sex: 'male', age: 30 })).toBeNull();
  });

  it('returns null for non-positive values', () => {
    expect(
      computeEnergy({
        sex: 'male',
        age: 0,
        heightCm: 180,
        weightKg: 80,
        activityLevel: 'moderate',
        goal: 'maintain',
      }),
    ).toBeNull();
  });

  it('computes tdee and a goal-adjusted target', () => {
    const result = computeEnergy({
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'moderate',
      goal: 'lose',
    });
    expect(result).not.toBeNull();
    // bmr 1780 * 1.55 = 2759 → lose applies -500
    expect(result!.tdee).toBe(2759);
    expect(result!.target).toBe(2259);
  });
});
