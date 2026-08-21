import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/**
 * Theme lives in localStorage rather than the Dexie `settings` singleton on
 * purpose: it has to be readable *synchronously* before the first paint (the
 * inline boot script in index.html reads this exact key), and it is a per-device
 * preference — the same account on a phone and a desktop shouldn't be forced to
 * share one. Keep this key in step with index.html.
 */
export const THEME_STORAGE_KEY = 'bee-healthy:theme';

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    // Private mode / storage disabled. Light is the default either way.
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Non-persisted theme still applies for this session.
  }
}

export interface ThemeControls {
  theme: Theme;
  toggle: () => void;
}

export function useTheme(): ThemeControls {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  // The boot script already set the class for the stored value; this keeps the
  // class honest if React's state was initialised from a different source
  // (e.g. storage cleared between the two).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
