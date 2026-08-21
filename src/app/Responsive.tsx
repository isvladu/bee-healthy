import type { ReactNode } from 'react';
import { useIsDesktop } from '@/hooks/useMediaQuery';

/**
 * Route-level counterpart to `AppLayout`'s shell switch: renders the Nectar
 * desktop screen or the existing mobile page for the same URL. Both branches
 * read the same repositories, so switching viewports never changes the data.
 */
export function Responsive({
  desktop,
  mobile,
}: {
  desktop: ReactNode;
  mobile: ReactNode;
}) {
  return <>{useIsDesktop() ? desktop : mobile}</>;
}
