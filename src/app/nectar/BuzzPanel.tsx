import { useState } from 'react';
import { Label, NButton, NCard } from '@/components/nectar/primitives';
import { cx } from '@/components/nectar/tokens';
import { useLLMClient } from '@/hooks/useLLMClient';
import { AskBuzzDialog } from './AskBuzzDialog';
import { BuzzGlyph } from './icons';
import { COACH_TIPS, type NectarTab } from './tabs';
import { useCoachStats } from './useCoachStats';

function StatRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="flex justify-between py-[5px] text-[12.5px]">
      <span className="text-ink2">{label}</span>
      <span className={cx('font-mono font-bold', positive ? 'text-sage' : 'text-ink')}>
        {value}
      </span>
    </div>
  );
}

/**
 * The persistent right-hand coach rail. Copy is keyed by the active tab
 * (verbatim from the design handoff); the numbers underneath it are real.
 */
export function BuzzPanel({ tab }: { tab: NectarTab }) {
  const client = useLLMClient();
  const stats = useCoachStats();
  const [asking, setAsking] = useState<string | null>(null);
  const copy = COACH_TIPS[tab];

  const rows = [
    stats.workouts && {
      label: 'Workouts',
      value: `${stats.workouts.done} / ${stats.workouts.total}`,
    },
    stats.avgProtein != null && {
      label: 'Avg protein',
      value: `${stats.avgProtein} g`,
    },
    stats.kcalAdherence != null && {
      label: 'Kcal adherence',
      value: `${stats.kcalAdherence}%`,
      positive: stats.kcalAdherence >= 90 && stats.kcalAdherence <= 110,
    },
  ].filter((row): row is { label: string; value: string; positive?: boolean } =>
    Boolean(row),
  );

  return (
    <aside className="flex w-[316px] flex-col gap-4 overflow-auto border-l border-line bg-card p-5">
      <div className="flex items-center gap-[10px]">
        <div className="flex size-[38px] flex-none items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_35%,#ffd36b,#f5a114)] shadow-[0_4px_12px_-5px_rgba(245,161,20,.9)]">
          <BuzzGlyph size={24} />
        </div>
        <div>
          <div className="font-display text-[15px] font-bold text-ink">Buzz</div>
          <div className="text-[11px] text-ink3">
            Your AI coach{client ? ` · ${client.model}` : ' · offline'}
          </div>
        </div>
      </div>

      <div className="rounded-[16px] border border-line2 bg-[image:var(--coach-surface)] p-4">
        <p className="m-0 text-[13px] leading-[1.55] text-ink2 dark:text-ink">
          {copy.tip}
        </p>
        <div className="mt-3 flex flex-wrap gap-[7px]">
          {copy.chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setAsking(chip)}
              className="cursor-pointer rounded-full border border-[color:var(--coach-line)] bg-soft px-[10px] py-[5px] text-[11.5px] font-semibold text-honeydd transition hover:brightness-105"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {rows.length > 0 && (
        <div>
          <Label>This week</Label>
          <NCard padded={false} className="mt-[9px] p-[14px]">
            {rows.map((row) => (
              <StatRow key={row.label} {...row} />
            ))}
          </NCard>
        </div>
      )}

      {stats.mealIdea && (
        <div className="rounded-[16px] border border-[color:var(--idea-line)] bg-[image:var(--idea-surface)] p-4">
          <div className="text-[12px] font-bold text-sage">🥗 Meal idea</div>
          <p className="mt-[6px] text-[13px] leading-[1.55] text-ink2 dark:text-ink">
            <span className="font-semibold">{stats.mealIdea.title}</span> —{' '}
            {stats.mealIdea.detail}
          </p>
        </div>
      )}

      <NButton
        variant="primary"
        className="justify-center"
        onClick={() => setAsking('')}
      >
        ✨ Ask Buzz anything
      </NButton>

      {asking != null && (
        <AskBuzzDialog
          context={stats.llmContext}
          initialPrompt={asking}
          onClose={() => setAsking(null)}
        />
      )}
    </aside>
  );
}
