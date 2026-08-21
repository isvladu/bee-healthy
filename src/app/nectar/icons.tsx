import type { SVGProps } from 'react';

/**
 * The Nectar icon set — stroke icons lifted from the design prototype. The repo
 * has no icon library and these are the exact shapes the handoff specifies
 * (home, leaf, cart, dumbbell, chart, book, sun, moon, search), so they stay
 * inline rather than pulling in a dependency for nine glyphs.
 */

function stroke(props: SVGProps<SVGSVGElement>) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };
}

export type IconProps = SVGProps<SVGSVGElement>;

export function IconHome(props: IconProps) {
  return (
    <svg {...stroke(props)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

export function IconLeaf(props: IconProps) {
  return (
    <svg {...stroke(props)}>
      <path d="M11 20A7 7 0 0 1 4 13c0-6 8-9 16-9 0 8-3 16-9 16Z" />
      <path d="M4 21c3-6 7-9 12-11" />
    </svg>
  );
}

export function IconCart(props: IconProps) {
  return (
    <svg {...stroke(props)}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.5 12.5a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
    </svg>
  );
}

export function IconDumbbell(props: IconProps) {
  return (
    <svg {...stroke(props)}>
      <path d="M6.5 6.5 17.5 17.5" />
      <path d="m3 8 3-3 3 3-3 3z" />
      <path d="m18 17 3-3-3-3-3 3z" />
      <path d="M4 12h16" />
    </svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <svg {...stroke(props)}>
      <path d="M3 3v18h18" />
      <path d="m7 14 4-4 3 3 5-6" />
    </svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <svg {...stroke(props)}>
      <path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2Z" />
      <path d="M19 20a2 2 0 0 0-2-2H4" />
    </svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <svg {...stroke(props)}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <svg {...stroke(props)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...stroke(props)} strokeLinecap="butt">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconGear(props: IconProps) {
  return (
    <svg {...stroke(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.9 14.6a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3.3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10.5 3.4V3.3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}

/** The app mark: rounded honey square with the striped bee body and wings. */
export function BeeMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#f5a114" />
      <ellipse cx="32" cy="38" rx="15" ry="17" fill="#231b12" />
      <rect x="17" y="28" width="30" height="5" rx="2.5" fill="#fbbf24" />
      <rect x="17" y="38" width="30" height="5" rx="2.5" fill="#fbbf24" />
      <rect x="17" y="48" width="30" height="4" rx="2" fill="#fbbf24" />
      <ellipse
        cx="24"
        cy="20"
        rx="8"
        ry="10"
        fill="#fff"
        opacity=".85"
        transform="rotate(-25 24 20)"
      />
      <ellipse
        cx="40"
        cy="20"
        rx="8"
        ry="10"
        fill="#fff"
        opacity=".85"
        transform="rotate(25 40 20)"
      />
    </svg>
  );
}

/** Buzz's face — the mark without its honey tile, for the gradient avatar. */
export function BuzzGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="32" cy="38" rx="15" ry="17" fill="#231b12" />
      <rect x="17" y="30" width="30" height="5" rx="2.5" fill="#fbbf24" />
      <rect x="17" y="40" width="30" height="4" rx="2" fill="#fbbf24" />
      <ellipse
        cx="24"
        cy="22"
        rx="7"
        ry="9"
        fill="#fff"
        opacity=".9"
        transform="rotate(-25 24 22)"
      />
      <ellipse
        cx="40"
        cy="22"
        rx="7"
        ry="9"
        fill="#fff"
        opacity=".9"
        transform="rotate(25 40 22)"
      />
    </svg>
  );
}
