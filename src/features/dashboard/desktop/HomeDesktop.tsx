import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import {
  CardHeader,
  EmptyState,
  Label,
  MacroBar,
  MacroLegend,
  NCard,
  Ring,
} from '@/components/nectar/primitives';
import { useSettings } from '@/hooks/useSettings';
import { bodyMetricsRepo, dietPlanRepo } from '@/lib/db/repositories';
import type { BodyMetric } from '@/lib/db/types';
import {
  dayIndexForDate,
  dayTotals,
  isoToday,
  macroSplit,
  mealEmoji,
  pickActivePlan,
} from '@/lib/diet/activePlan';
import { computeEnergy } from '@/lib/nutrition/energy';

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-[24px] font-bold leading-none text-[#ffd36b]">
        {value}
      </div>
      <div className="mt-[6px] text-[11px] text-[#cbb590]">{label}</div>
    </div>
  );
}

/**
 * Five-week weight sparkline. Hand-rolled SVG rather than recharts: it is four
 * lines of geometry, and the dashboard is the first screen the desktop shell
 * paints — no reason to pull a chart library into that path.
 */
function WeightSparkline({ points }: { points: BodyMetric[] }) {
  const values = points
    .map((metric) => metric.weightKg)
    .filter((kg): kg is number => kg != null);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 288 / (values.length - 1);
  const coords = values.map((value, i) => ({
    x: Math.round((6 + i * step) * 10) / 10,
    y: Math.round((10 + ((max - value) / span) * 42) * 10) / 10,
  }));
  const line = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const last = coords[coords.length - 1];

  return (
    <svg
      className="block h-16 w-full"
      viewBox="0 0 300 64"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="weight-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5a114" stopOpacity="var(--spark-fill)" />
          <stop offset="1" stopColor="#f5a114" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M${coords.map((c) => `${c.x},${c.y}`).join(' L')} L${last.x},64 L${coords[0].x},64 Z`}
        fill="url(#weight-fill)"
      />
      <polyline
        points={line}
        fill="none"
        stroke="#f5a114"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* A zero-length round-capped stroke, not a <circle>: the viewBox is
          stretched horizontally to fill the card, which would squash a circle
          into an ellipse. `non-scaling-stroke` keeps this dot round. */}
      <polyline
        points={`${last.x},${last.y} ${last.x},${last.y}`}
        fill="none"
        stroke="#c2740a"
        strokeWidth="7"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function HomeDesktop() {
  const settings = useSettings();
  const plans = useLiveQuery(() => dietPlanRepo.listByCreatedDesc(), []);
  const metrics = useLiveQuery(() => bodyMetricsRepo.listByDateDesc(), []);

  const today = isoToday();
  const plan = pickActivePlan(plans, today);
  const dayIndex = plan ? dayIndexForDate(plan, today) : 0;
  const day = plan?.days[dayIndex] ?? null;
  const macros = day ? dayTotals(day) : null;
  const split = macroSplit(macros);

  const energy = settings
    ? computeEnergy({
        sex: settings.sex,
        age: settings.age,
        heightCm: settings.heightCm,
        weightKg: settings.weightKg,
        activityLevel: settings.activityLevel,
        goal: settings.goal,
      })
    : null;
  const target = energy?.target ?? null;

  // Newest-first from the repo; the chart wants oldest-first.
  const weighIns = (metrics ?? []).filter((m) => m.weightKg != null);
  const trend = weighIns.slice(0, 5).reverse();
  const latestWeight = weighIns[0]?.weightKg ?? settings?.weightKg ?? null;
  const startWeight = trend[0]?.weightKg ?? null;
  const weightDelta =
    latestWeight != null && startWeight != null
      ? Math.round((latestWeight - startWeight) * 10) / 10
      : null;

  const plannedPct = macros && target ? Math.round((macros.kcal / target) * 100) : null;

  const dayLabel = day ? (day.label ?? `Day ${dayIndex + 1}`) : null;

  return (
    <div>
      <section className="relative overflow-hidden rounded-[18px] bg-[linear-gradient(120deg,#241b11,#3a2c1a)] px-6 py-[22px] text-white">
        <div
          className="pointer-events-none absolute -right-[30px] -top-[30px] size-[180px] rounded-full bg-[radial-gradient(circle,rgba(245,161,20,.35),transparent_70%)]"
          aria-hidden
        />
        <h1 className="relative font-display text-[22px] font-bold tracking-[-0.01em]">
          {greeting(new Date())} 🐝
        </h1>
        <p className="relative mt-1 text-[13px] text-[#cbb590]">
          {plan
            ? `${dayLabel} of ${plan.title}`
            : 'No active plan yet — generate one to see your day at a glance.'}
        </p>
        <div className="relative mt-4 flex flex-wrap gap-[34px]">
          <HeroStat
            value={target ? target.toLocaleString() : '—'}
            label="TARGET KCAL"
          />
          <HeroStat
            value={macros ? Math.round(macros.kcal).toLocaleString() : '—'}
            label={plannedPct != null ? `PLANNED · ${plannedPct}%` : 'PLANNED'}
          />
          <HeroStat
            value={latestWeight != null ? `${Math.round(latestWeight * 10) / 10}` : '—'}
            label={
              weightDelta != null && weightDelta !== 0
                ? `WEIGHT · ${weightDelta < 0 ? '▼' : '▲'}${Math.abs(weightDelta)}`
                : 'WEIGHT'
            }
          />
          <HeroStat
            value={macros ? `${Math.round(macros.protein)}g` : '—'}
            label="PROTEIN"
          />
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-[15px]">
        <NCard>
          <CardHeader title="Today's macros" />
          {macros ? (
            <div className="flex items-center gap-4">
              <Ring
                percent={plannedPct ?? 0}
                value={plannedPct != null ? `${plannedPct}%` : '—'}
                label={`${Math.round(macros.kcal).toLocaleString()} kcal`}
              />
              <div className="flex-1">
                <MacroBar {...split} />
                <MacroLegend
                  protein={macros.protein}
                  carbs={macros.carbs}
                  fat={macros.fat}
                  className="mt-3"
                />
              </div>
            </div>
          ) : (
            <p className="text-[13px] leading-[1.55] text-ink2">
              Today's plan has no macros attached. Imported plans often skip them — a
              generated plan fills them in.
            </p>
          )}
        </NCard>

        <NCard>
          <CardHeader title="Weight trend">
            <Label>{trend.length} entries</Label>
          </CardHeader>
          {trend.length >= 2 ? (
            <>
              <WeightSparkline points={trend} />
              <div className="mt-2 flex justify-between text-[12px] text-ink2">
                <div>
                  <span className="font-mono font-bold text-ink">
                    {Math.round((startWeight ?? 0) * 10) / 10}
                  </span>{' '}
                  start
                </div>
                {weightDelta != null && (
                  <span
                    className={`font-mono font-bold ${weightDelta <= 0 ? 'text-sage' : 'text-terra'}`}
                  >
                    {weightDelta > 0 ? '+' : '−'}
                    {Math.abs(weightDelta)}kg
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="text-[13px] leading-[1.55] text-ink2">
              Log at least two weigh-ins in Settings and your trend appears here.
            </p>
          )}
        </NCard>

        <NCard className="col-span-2">
          <CardHeader title={plan ? `Today's plan · ${plan.title}` : "Today's plan"}>
            {plan && (
              <Link
                to={`/diet/${plan.id}`}
                className="text-[12.5px] font-semibold text-honeyd hover:text-honeydd"
              >
                Open →
              </Link>
            )}
          </CardHeader>
          {day && day.meals.length > 0 ? (
            // Auto-fit rather than a fixed 3 columns: real plans run three to
            // five meals, and a hard 3-col grid strands the fourth on its own row.
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[14px]">
              {day.meals.map((meal, index) => (
                <div key={`${meal.name}-${index}`}>
                  <div className="flex items-center justify-between gap-[10px]">
                    <span className="text-[14px] font-bold text-ink">
                      {mealEmoji(meal.name)} {meal.name}
                    </span>
                    {meal.macros && (
                      <span className="font-mono text-[12.5px] font-bold text-honeydd">
                        {Math.round(meal.macros.kcal)}
                      </span>
                    )}
                  </div>
                  <ul className="mt-[7px] flex list-none flex-wrap gap-[6px] p-0">
                    {meal.items.slice(0, 3).map((item, itemIndex) => (
                      <li
                        key={`${item.name}-${itemIndex}`}
                        className="rounded-full border border-line bg-card2 px-[9px] py-[3px] text-[12px] text-ink2"
                      >
                        {item.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState emoji="🥗" title="Nothing planned for today">
              {plan
                ? "This plan doesn't cover today. Open it to browse the days it does."
                : 'Generate or import a diet plan and your day shows up here.'}{' '}
              <Link to="/diet" className="font-semibold text-honeyd">
                Go to Diet →
              </Link>
            </EmptyState>
          )}
        </NCard>
      </div>

      {plan && day && (
        <p className="mt-3 text-[11.5px] text-ink3">
          Showing {format(new Date(`${today}T00:00:00`), 'EEEE, MMM d')} · figures are
          from your plan, not a food log.
        </p>
      )}
    </div>
  );
}
