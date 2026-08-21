import { describe, expect, it } from 'vitest';
import { checkInStreak } from './streak';

describe('checkInStreak', () => {
  it('is zero with no entries', () => {
    expect(checkInStreak(undefined, '2026-08-21')).toBe(0);
    expect(checkInStreak([], '2026-08-21')).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(
      checkInStreak(['2026-08-21', '2026-08-20', '2026-08-19'], '2026-08-21'),
    ).toBe(3);
  });

  it('survives a run that ended yesterday', () => {
    expect(checkInStreak(['2026-08-20', '2026-08-19'], '2026-08-21')).toBe(2);
  });

  it('breaks once a full day has been missed', () => {
    expect(checkInStreak(['2026-08-19', '2026-08-18'], '2026-08-21')).toBe(0);
  });

  it('stops at the first gap', () => {
    expect(
      checkInStreak(
        ['2026-08-21', '2026-08-20', '2026-08-18', '2026-08-17'],
        '2026-08-21',
      ),
    ).toBe(2);
  });

  it('does not double-count two entries on the same day', () => {
    expect(
      checkInStreak(['2026-08-21', '2026-08-21', '2026-08-20'], '2026-08-21'),
    ).toBe(2);
  });

  it('ignores entries dated in the future', () => {
    expect(checkInStreak(['2026-09-01'], '2026-08-21')).toBe(0);
  });

  it('crosses a month boundary', () => {
    expect(checkInStreak(['2026-08-01', '2026-07-31'], '2026-08-01')).toBe(2);
  });
});
