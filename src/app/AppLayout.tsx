import { useIsDesktop } from '@/hooks/useMediaQuery';
import { MobileShell } from './MobileShell';
import { NectarShell } from './nectar/NectarShell';

/**
 * Picks the app shell by viewport. Nectar's desktop layout (top nav + coach
 * rail + bento) and the mobile column are structurally different enough that a
 * single fluid layout serves neither well, so we render one or the other —
 * every feature component, hook and repository underneath is shared
 * (EXPANSION_PLAN §7.1).
 */
export function AppLayout() {
  return useIsDesktop() ? <NectarShell /> : <MobileShell />;
}
