import { useCallback, useSyncExternalStore } from 'react';

/**
 * The viewport at which the Nectar desktop shell takes over from the mobile
 * shell. Matches Tailwind's `lg`, and EXPANSION_PLAN §7.1: the two shells are
 * structurally different, so we pick one rather than fluidly morphing.
 */
export const DESKTOP_QUERY = '(min-width: 1024px)';

export function useMediaQuery(query: string): boolean {
  // Memoised so `useSyncExternalStore` doesn't tear down and re-add the
  // listener on every render.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  // No SSR here, but jsdom stubs `matchMedia` in tests; `false` means the
  // mobile shell, which is the safer thing to render blind.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
