import { Outlet, useLocation } from 'react-router-dom';
import { useTheme } from '@/lib/theme/theme';
import { BuzzPanel } from './BuzzPanel';
import { tabForPath } from './tabs';
import { TopNav } from './TopNav';

/**
 * The desktop app shell ("Nectar", EXPANSION_PLAN §7.2): a 64px top nav over a
 * `1fr 316px` body — scrolling main content beside a persistent coach rail.
 * Chosen by viewport in `AppLayout`; the mobile shell is a separate tree.
 */
export function NectarShell() {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const tab = tabForPath(pathname);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper font-ui text-ink">
      <TopNav theme={theme} onToggleTheme={toggle} />
      <div className="grid flex-1 grid-cols-[1fr_316px] overflow-hidden">
        <main className="overflow-auto px-[26px] py-[22px]">
          <Outlet />
        </main>
        <BuzzPanel tab={tab} />
      </div>
    </div>
  );
}
