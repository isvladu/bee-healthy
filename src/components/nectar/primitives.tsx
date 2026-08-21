import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx, MACRO_COLORS } from './tokens';

/**
 * The Nectar design system's building blocks, shared by every desktop screen.
 * Sizes here are the literal values from the handoff (§7.4) — the design is
 * specced in px, so they stay px rather than being rounded to Tailwind's scale.
 */

/* --------------------------------- surfaces -------------------------------- */

export function NCard({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-[16px] border border-line bg-card',
        padded && 'p-[18px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  children,
}: {
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-[14px] flex items-center justify-between gap-3">
      <div className="font-display text-[15.5px] font-bold text-ink">{title}</div>
      {children}
    </div>
  );
}

/** JetBrains Mono micro-label: uppercase, wide tracking. */
export function Label({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink3',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {subtitle && <div className="text-[12.5px] text-ink2">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

/* --------------------------------- controls -------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
};

export function NButton({ variant = 'ghost', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-[11px] border px-[15px] py-[9px] text-[13.5px] font-semibold transition-[transform,background,box-shadow] duration-[80ms] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0',
        variant === 'primary'
          ? 'border-transparent bg-honey text-[#3a2400] shadow-[0_1px_0_rgba(255,255,255,.4)_inset,0_6px_14px_-6px_rgba(245,161,20,.9)] hover:bg-[#ffad24]'
          : 'border-line2 bg-card text-ink hover:bg-card2',
        className,
      )}
    />
  );
}

export function Chip({
  active,
  sub,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; sub?: ReactNode }) {
  return (
    <button
      {...props}
      aria-pressed={active}
      className={cx(
        'cursor-pointer whitespace-nowrap rounded-full border px-[13px] py-[6px] text-[12.5px] font-semibold transition duration-[120ms]',
        active
          ? 'border-honey bg-honey text-[#3a2400] shadow-[0_4px_10px_-5px_rgba(245,161,20,.9)]'
          : 'border-line2 bg-card text-ink2 hover:bg-card2',
        className,
      )}
    >
      {children}
      {sub != null && (
        <span className="ml-[6px] font-mono text-[9.5px] font-semibold opacity-70">
          {sub}
        </span>
      )}
    </button>
  );
}

/** The honey tick-box used by shopping rows and session cards. */
export function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cx(
        'flex size-[22px] flex-none items-center justify-center rounded-[7px] border-2 transition duration-[120ms]',
        checked ? 'border-honey bg-honey' : 'border-line2 bg-card',
      )}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#3a2400"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cx(
          'transition duration-[120ms]',
          checked ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

/* ----------------------------------- data ---------------------------------- */

export function StatCard({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-[14px] border px-[15px] py-[14px]',
        accent
          ? 'border-line2 bg-[image:var(--accent-surface)]'
          : 'border-line bg-card',
      )}
    >
      <Label className="mb-[9px]">{label}</Label>
      <div
        className={cx(
          'font-mono text-[25px] font-bold leading-none tracking-[-0.02em]',
          accent ? 'text-honeydd' : 'text-ink',
        )}
      >
        {value}
        {unit != null && (
          <span className="ml-[3px] text-[12px] font-semibold text-ink3">{unit}</span>
        )}
      </div>
      {sub != null && (
        <div className="mt-[7px] flex items-center gap-[5px] text-[12px] text-ink2">
          {sub}
        </div>
      )}
    </div>
  );
}

/** Stacked protein/carbs/fat bar. Widths are percentages of energy, not grams. */
export function MacroBar({
  protein,
  carbs,
  fat,
  className,
}: {
  protein: number;
  carbs: number;
  fat: number;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'flex h-[9px] overflow-hidden rounded-full border border-line bg-card2',
        className,
      )}
    >
      <div style={{ width: `${protein}%`, background: MACRO_COLORS.protein }} />
      <div style={{ width: `${carbs}%`, background: MACRO_COLORS.carbs }} />
      <div style={{ width: `${fat}%`, background: MACRO_COLORS.fat }} />
    </div>
  );
}

export function MacroLegend({
  protein,
  carbs,
  fat,
  className,
}: {
  protein: number;
  carbs: number;
  fat: number;
  className?: string;
}) {
  const rows = [
    { label: 'Protein', grams: protein, color: MACRO_COLORS.protein },
    { label: 'Carbs', grams: carbs, color: MACRO_COLORS.carbs },
    { label: 'Fat', grams: fat, color: MACRO_COLORS.fat },
  ];
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center gap-[7px] text-[12px] text-ink2"
        >
          <span
            className="size-[9px] flex-none rounded-[3px]"
            style={{ background: row.color }}
          />
          {row.label}
          <span className="ml-auto font-mono font-bold text-ink">
            {Math.round(row.grams)}g
          </span>
        </div>
      ))}
    </div>
  );
}

/** Conic-gradient progress ring with a value/label stack in the middle. */
export function Ring({
  percent,
  value,
  label,
}: {
  percent: number;
  value: ReactNode;
  label: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="flex size-[118px] flex-none items-center justify-center rounded-full shadow-[0_0_0_1px_var(--line)_inset]"
      style={{
        background: `conic-gradient(var(--honey) 0 ${clamped}%, var(--card2) ${clamped}% 100%)`,
      }}
    >
      <div className="flex size-[88px] flex-col items-center justify-center rounded-full bg-card shadow-[0_1px_4px_rgba(0,0,0,.05)]">
        <div className="font-mono text-[19px] font-bold leading-none text-ink">
          {value}
        </div>
        <div className="mt-[3px] text-[10px] text-ink3">{label}</div>
      </div>
    </div>
  );
}

/** Shown wherever a screen has no records to derive anything from yet. */
export function EmptyState({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <NCard className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="text-3xl" aria-hidden>
        {emoji}
      </div>
      <div className="font-display text-[16px] font-bold text-ink">{title}</div>
      <div className="max-w-sm text-[13px] leading-[1.55] text-ink2">{children}</div>
    </NCard>
  );
}
