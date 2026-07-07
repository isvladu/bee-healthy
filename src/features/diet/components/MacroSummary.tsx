import type { Macros } from '@/lib/db/types';

export function MacroSummary({
  macros,
  size = 'sm',
}: {
  macros: Macros;
  size?: 'sm' | 'lg';
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span
        className={
          size === 'lg'
            ? 'text-2xl font-bold text-honey-700'
            : 'text-sm font-semibold text-honey-800'
        }
      >
        {Math.round(macros.kcal).toLocaleString()}
        <span className="ml-1 text-xs font-medium text-honey-900/50">kcal</span>
      </span>
      <span className="text-xs text-honey-900/60">
        P {Math.round(macros.protein)}g · C {Math.round(macros.carbs)}g · F{' '}
        {Math.round(macros.fat)}g
      </span>
    </div>
  );
}
