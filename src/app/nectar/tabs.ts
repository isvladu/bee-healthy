import type { ComponentType } from 'react';
import {
  IconBook,
  IconCart,
  IconChart,
  IconDumbbell,
  IconHome,
  IconLeaf,
  type IconProps,
} from './icons';

export type NectarTab =
  'home' | 'diet' | 'shopping' | 'workout' | 'insights' | 'cookbook';

export interface NavTab {
  tab: NectarTab;
  to: string;
  label: string;
  Icon: ComponentType<IconProps>;
}

export const NAV_TABS: NavTab[] = [
  { tab: 'home', to: '/', label: 'Home', Icon: IconHome },
  { tab: 'diet', to: '/diet', label: 'Diet', Icon: IconLeaf },
  { tab: 'shopping', to: '/shopping', label: 'Shopping', Icon: IconCart },
  { tab: 'workout', to: '/workout', label: 'Workout', Icon: IconDumbbell },
  { tab: 'insights', to: '/insights', label: 'Insights', Icon: IconChart },
  { tab: 'cookbook', to: '/cookbook', label: 'Cookbook', Icon: IconBook },
];

/**
 * Which tab a URL belongs to. Deeper routes count as their tab (`/diet/abc` is
 * Diet), and the nested shopping/insights routes are claimed by their own tab
 * rather than by the plan they hang off — matching the top nav's six tabs.
 */
export function tabForPath(pathname: string): NectarTab {
  if (pathname.endsWith('/shopping') || pathname.startsWith('/shopping')) {
    return 'shopping';
  }
  if (pathname.endsWith('/insights') || pathname.startsWith('/insights')) {
    return 'insights';
  }
  if (pathname.startsWith('/diet')) return 'diet';
  if (pathname.startsWith('/workout')) return 'workout';
  if (pathname.startsWith('/cookbook')) return 'cookbook';
  return 'home';
}

export interface CoachCopy {
  tip: string;
  chips: [string, string];
}

/**
 * Buzz's per-screen copy, lifted verbatim from the prototype's `tips` map
 * (docs/design/desktop-redesign). Static for this pass — the handoff calls for
 * wiring the live model in incrementally, which "Ask Buzz" does.
 */
export const COACH_TIPS: Record<NectarTab, CoachCopy> = {
  home: {
    tip: "You're pacing well today — 700 kcal left and dinner still to log. Protein at 142/190g; the salmon closes most of it. Want me to front-load protein at breakfast tomorrow?",
    chips: ['Adjust tomorrow', 'Log dinner now'],
  },
  diet: {
    tip: 'This plan runs a clean ~450 kcal deficit with protein high enough to hold muscle through the cut. Refeed on Saturday keeps things sustainable.',
    chips: ['Swap a meal', 'Regenerate plan'],
  },
  shopping: {
    tip: "I grouped everything by aisle so you can shop top-to-bottom. You've got the proteins already — just produce and pantry left.",
    chips: ['Email me the list', 'Add to reminders'],
  },
  workout: {
    tip: "You're 2 of 5 sessions into week 2. Lower A moved well — your squat's up 4kg on estimate. Keep RPE around 8 on the B days.",
    chips: ['Log a session', 'Explain RPE'],
  },
  insights: {
    tip: 'Every lift is trending up and volume climbed 32% across the block — strong progression. A deload after week 4 will set up the next PR attempt.',
    chips: ['Plan a deload', 'Compare lifts'],
  },
  cookbook: {
    tip: "Your saved recipes average 39g protein per serving — great for the cut. The overnight oats fit tomorrow's pre-workout window perfectly.",
    chips: ['Generate a recipe', 'Filter high-protein'],
  },
};
