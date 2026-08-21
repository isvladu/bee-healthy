import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import {
  Chip,
  EmptyState,
  Label,
  MacroBar,
  MacroLegend,
  NButton,
  NCard,
  PageHeader,
  Ring,
} from '@/components/nectar/primitives';
import { useSettings } from '@/hooks/useSettings';
import { dietPlanRepo } from '@/lib/db/repositories';
import type { DietDay } from '@/lib/db/types';
import {
  dayIndexForDate,
  dayTotals,
  formatFoodItem,
  isoToday,
  macroSplit,
  mealEmoji,
  pickActivePlan,
  vsTargetNote,
} from '@/lib/diet/activePlan';
import { averageDailyCalories } from '@/lib/diet/planMapper';
import { computeEnergy } from '@/lib/nutrition/energy';
import { DietPlanner } from '../DietPlanner';

/** Short weekday for a day chip: the plan's own label if it has one. */
function chipLabel(day: DietDay, index: number): string {
  if (day.label) return day.label.split(/[—–-]/)[0].trim().slice(0, 12);
  if (day.date) return format(new Date(`${day.date}T00:00:00`), 'EEE');
  return `Day ${index + 1}`;
}

export function DietDesktop() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const plans = useLiveQuery(() => dietPlanRepo.listByCreatedDesc(), []);

  const plan = planId
    ? (plans?.find((candidate) => candidate.id === planId) ?? null)
    : pickActivePlan(plans);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Open on today when the plan covers it, but never fight the user's clicks —
  // the reset only fires when the plan itself changes.
  useEffect(() => {
    setSelectedDay(plan ? dayIndexForDate(plan, isoToday()) : null);
  }, [plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (plans === undefined) {
    return <div className="text-[13px] text-ink3">Loading your plans…</div>;
  }

  if (!plan) {
    return (
      <div>
        <PageHeader
          title="Diet"
          subtitle="Generate a plan with macros, then review it day by day."
        />
        <div className="legacy-surface max-w-[720px]">
          <DietPlanner />
        </div>
      </div>
    );
  }

  const dayIndex = Math.min(selectedDay ?? 0, Math.max(0, plan.days.length - 1));
  const day = plan.days[dayIndex];
  const macros = day ? dayTotals(day) : null;
  const split = macroSplit(macros);

  const target =
    computeEnergy({
      sex: settings?.sex,
      age: settings?.age,
      heightCm: settings?.heightCm,
      weightKg: settings?.weightKg,
      activityLevel: settings?.activityLevel,
      goal: settings?.goal,
    })?.target ?? null;

  const avgKcal = averageDailyCalories(plan);
  const subtitleParts = [
    `${plan.days.length} day${plan.days.length === 1 ? '' : 's'}`,
    avgKcal > 0 ? `avg ${avgKcal.toLocaleString()} kcal/day` : null,
    plan.startDate
      ? `from ${format(new Date(`${plan.startDate}T00:00:00`), 'EEE, MMM d')}`
      : null,
  ].filter(Boolean);

  return (
    <div>
      <PageHeader title={plan.title} subtitle={subtitleParts.join(' · ')}>
        <NButton onClick={() => navigate(`/diet/${plan.id}/shopping`)}>
          🛒 Shopping list
        </NButton>
      </PageHeader>

      <div className="flex gap-2 overflow-auto pb-1">
        {plan.days.map((candidate, index) => {
          const totals = dayTotals(candidate);
          return (
            <Chip
              key={candidate.date || index}
              active={index === dayIndex}
              onClick={() => setSelectedDay(index)}
              sub={totals ? Math.round(totals.kcal).toLocaleString() : undefined}
            >
              {chipLabel(candidate, index)}
            </Chip>
          );
        })}
      </div>

      {!day ? (
        <EmptyState emoji="📄" title="This plan has no days">
          Re-generate it, or{' '}
          <Link to="/diet" className="font-semibold text-honeyd">
            start a new plan
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="mt-4 grid grid-cols-[1.6fr_1fr] gap-[15px] items-start">
          <NCard>
            <h2 className="font-display text-[16px] font-bold text-ink">
              {day.label ?? `Day ${dayIndex + 1}`}
            </h2>
            {(day.note || day.date) && (
              <div className="text-[12.5px] text-ink2">
                {day.note ?? format(new Date(`${day.date}T00:00:00`), 'EEEE, MMMM d')}
              </div>
            )}

            {day.meals.map((meal, index) => (
              <div
                key={`${meal.name}-${index}`}
                className="border-t border-line py-[13px]"
              >
                <div className="flex items-center justify-between gap-[10px]">
                  <span className="text-[14px] font-bold text-ink">
                    {mealEmoji(meal.name)} {meal.name}
                  </span>
                  {meal.macros && (
                    <span className="font-mono text-[12.5px] font-bold text-honeydd">
                      {Math.round(meal.macros.kcal)} kcal
                    </span>
                  )}
                </div>
                <ul className="mt-[7px] flex list-none flex-wrap gap-[6px] p-0">
                  {meal.items.map((item, itemIndex) => (
                    <li
                      key={`${item.name}-${itemIndex}`}
                      className="rounded-full border border-line bg-card2 px-[9px] py-[3px] text-[12px] text-ink2"
                    >
                      {formatFoodItem(item)}
                    </li>
                  ))}
                </ul>
                {meal.macros && (
                  <div className="mt-[6px] font-mono text-[11px] text-ink3">
                    P {Math.round(meal.macros.protein)}g · C{' '}
                    {Math.round(meal.macros.carbs)}g · F {Math.round(meal.macros.fat)}g
                  </div>
                )}
                {meal.note && (
                  <div className="mt-[6px] text-[12px] text-ink2">{meal.note}</div>
                )}
              </div>
            ))}
          </NCard>

          <NCard>
            <Label>Day total</Label>
            {macros ? (
              <>
                <div className="my-[14px] flex justify-center">
                  <Ring
                    percent={target ? (macros.kcal / target) * 100 : 100}
                    value={Math.round(macros.kcal).toLocaleString()}
                    label="kcal"
                  />
                </div>
                <MacroBar {...split} />
                <MacroLegend
                  protein={macros.protein}
                  carbs={macros.carbs}
                  fat={macros.fat}
                  className="mt-[13px] gap-[9px]"
                />
                <div className="mt-[14px] border-t border-line pt-[13px]">
                  <Label>vs target</Label>
                  <p className="mt-[7px] text-[13px] leading-[1.55] text-ink2 dark:text-ink">
                    {vsTargetNote(macros.kcal, target)}
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-3 text-[13px] leading-[1.55] text-ink2">
                This day has no macros. Plans imported from a chat subscription often
                omit them — the totals reappear on a generated plan.
              </p>
            )}
          </NCard>
        </div>
      )}
    </div>
  );
}
