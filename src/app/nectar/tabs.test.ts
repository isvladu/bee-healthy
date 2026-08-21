import { describe, expect, it } from 'vitest';
import { COACH_TIPS, NAV_TABS, tabForPath, type NectarTab } from './tabs';

describe('tabForPath', () => {
  const cases: Array<[string, NectarTab]> = [
    ['/', 'home'],
    ['/diet', 'diet'],
    ['/diet/abc-123', 'diet'],
    ['/shopping', 'shopping'],
    ['/workout', 'workout'],
    ['/workout/abc-123', 'workout'],
    ['/insights', 'insights'],
    ['/cookbook', 'cookbook'],
    ['/cookbook/abc-123', 'cookbook'],
    ['/settings', 'home'],
  ];

  it.each(cases)('maps %s to the %s tab', (pathname, expected) => {
    expect(tabForPath(pathname)).toBe(expected);
  });

  it('gives the nested shopping and insights routes their own tab, not their parent plan’s', () => {
    expect(tabForPath('/diet/abc-123/shopping')).toBe('shopping');
    expect(tabForPath('/workout/abc-123/insights')).toBe('insights');
  });
});

describe('coach copy', () => {
  it('covers every nav tab, so the panel never renders undefined', () => {
    for (const { tab } of NAV_TABS) {
      expect(COACH_TIPS[tab]).toBeDefined();
      expect(COACH_TIPS[tab].tip.length).toBeGreaterThan(0);
      expect(COACH_TIPS[tab].chips).toHaveLength(2);
    }
  });

  it('has a route for every tab the coach has copy for', () => {
    const routed = new Set(NAV_TABS.map((item) => item.tab));
    for (const tab of Object.keys(COACH_TIPS)) {
      expect(routed.has(tab as NectarTab)).toBe(true);
    }
  });
});
