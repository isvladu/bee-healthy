import { Link, NavLink } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { cx } from '@/components/nectar/tokens';
import { useAuth } from '@/hooks/useAuth';
import { bodyMetricsRepo } from '@/lib/db/repositories';
import { checkInStreak } from '@/lib/metrics/streak';
import type { Theme } from '@/lib/theme/theme';
import { BeeMark, BuzzGlyph, IconMoon, IconSun } from './icons';
import { QuickSearch } from './QuickSearch';
import { NAV_TABS } from './tabs';

export function TopNav({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const { user } = useAuth();
  const metrics = useLiveQuery(() => bodyMetricsRepo.listByDateDesc(), []);
  const streak = checkInStreak(metrics?.map((metric) => metric.date));

  // Signed out (or local-only) there are no initials to show, so the avatar
  // falls back to Buzz's glyph rather than a squashed emoji.
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : null;

  return (
    <header className="flex h-16 flex-none items-center gap-5 border-b border-line bg-card px-6">
      <Link to="/" className="flex items-center gap-[10px] pr-[6px]">
        <BeeMark size={30} />
        <span className="font-display text-[17px] font-bold tracking-[-0.01em] text-ink">
          Bee Healthy
        </span>
      </Link>

      <nav className="flex h-full gap-[2px]">
        {NAV_TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-[7px] border-b-[2.5px] px-[13px] text-[13.5px] font-semibold transition duration-[120ms]',
                isActive
                  ? 'border-honey text-honeydd'
                  : 'border-transparent text-ink2 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  width={17}
                  height={17}
                  className={isActive ? 'opacity-100' : 'opacity-70'}
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <QuickSearch />

        {streak > 0 && (
          <div
            className="flex items-center gap-[3px] font-mono text-[11px] font-bold text-honeyd"
            title={`${streak}-day check-in streak`}
          >
            🔥{streak}
          </div>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={
            theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
          }
          className="flex size-[34px] flex-none cursor-pointer items-center justify-center rounded-[10px] border border-line2 bg-card2 text-ink2 transition duration-[140ms] hover:bg-soft hover:text-honeydd"
        >
          {theme === 'dark' ? (
            <IconSun width={17} height={17} />
          ) : (
            <IconMoon width={16} height={16} />
          )}
        </button>

        <Link
          to="/settings"
          title={user?.email ?? 'Settings'}
          aria-label={user?.email ? `Settings — ${user.email}` : 'Settings'}
          className="flex size-[34px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#ffd36b] to-[#f5a114] text-[13px] font-bold text-[#4a2e00] shadow-[0_0_0_2px_var(--card),0_0_0_3px_var(--line2)]"
        >
          {initials ?? <BuzzGlyph size={20} />}
        </Link>
      </div>
    </header>
  );
}
