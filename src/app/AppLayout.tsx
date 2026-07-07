import { NavLink, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Home', end: true, icon: <IconHome /> },
  { to: '/diet', label: 'Diet', icon: <IconLeaf /> },
  { to: '/workout', label: 'Workout', icon: <IconDumbbell /> },
  { to: '/cookbook', label: 'Cookbook', icon: <IconBook /> },
  { to: '/settings', label: 'Settings', icon: <IconGear /> },
];

export function AppLayout() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-honey-100 bg-honey-50/80 px-4 py-3 backdrop-blur">
        <span className="text-2xl" aria-hidden>
          🐝
        </span>
        <h1 className="text-lg font-bold tracking-tight text-honey-800">
          Bee Healthy
        </h1>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-honey-100 bg-white/90 backdrop-blur">
        <ul className="flex items-stretch justify-around">
          {navItems.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors',
                    isActive
                      ? 'text-honey-600'
                      : 'text-honey-900/50 hover:text-honey-700',
                  ].join(' ')
                }
              >
                <span className="h-6 w-6" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/* --- Inline icons (no icon-library dependency for the scaffold) --- */

function svgProps() {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'h-full w-full',
  };
}

function IconHome() {
  return (
    <svg {...svgProps()}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function IconLeaf() {
  return (
    <svg {...svgProps()}>
      <path d="M11 20A7 7 0 0 1 4 13c0-6 8-9 16-9 0 8-3 16-9 16Z" />
      <path d="M4 21c3-6 7-9 12-11" />
    </svg>
  );
}

function IconDumbbell() {
  return (
    <svg {...svgProps()}>
      <path d="M6.5 6.5 17.5 17.5" />
      <path d="m3 8 3-3 3 3-3 3z" />
      <path d="m15 20 3-3 3 3-3 3z" transform="translate(-3 -3)" />
      <path d="M4 12h16" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg {...svgProps()}>
      <path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2Z" />
      <path d="M19 20a2 2 0 0 0-2-2H4" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 2.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}
