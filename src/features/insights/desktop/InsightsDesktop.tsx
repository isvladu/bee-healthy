import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CardHeader,
  EmptyState,
  NCard,
  PageHeader,
  StatCard,
} from '@/components/nectar/primitives';
import { MACRO_COLORS } from '@/components/nectar/tokens';
import { workoutPlanRepo } from '@/lib/db/repositories';
import { adherencePct, compactNumber } from '@/lib/workout/blockStats';
import {
  CHART,
  scaleBars,
  scaleSeries,
  slotCentres,
} from '@/lib/workout/chartGeometry';
import {
  exercise1RMSeries,
  trackedExercises,
  weeklyStats,
} from '@/lib/workout/insights';

/** Baseline, axis and two dashed gridlines — shared by both charts. */
function ChartFrame({ labels }: { labels: string[] }) {
  const xs = slotCentres(labels.length);
  const gridlines = [
    CHART.top + (CHART.bottom - CHART.top) / 3,
    CHART.top + ((CHART.bottom - CHART.top) * 2) / 3,
  ];
  return (
    <>
      <line
        x1={CHART.left}
        y1={CHART.top}
        x2={CHART.left}
        y2={CHART.bottom}
        stroke="var(--line)"
        strokeWidth="1"
      />
      <line
        x1={CHART.left}
        y1={CHART.bottom}
        x2={CHART.right}
        y2={CHART.bottom}
        stroke="var(--line)"
        strokeWidth="1"
      />
      {gridlines.map((y) => (
        <line
          key={y}
          x1={CHART.left}
          y1={y}
          x2={CHART.right}
          y2={y}
          stroke="var(--line)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      ))}
      {labels.map((label, index) => (
        <text
          key={label}
          x={xs[index]}
          y={184}
          textAnchor="middle"
          className="font-mono"
          fontSize="9"
          fill="var(--ink3)"
        >
          {label}
        </text>
      ))}
    </>
  );
}

/**
 * A data point. Drawn as a zero-length round-capped stroke rather than a
 * `<circle>` because the charts stretch their viewBox to the card width
 * (`preserveAspectRatio="none"`), which would squash a circle into an ellipse.
 * `non-scaling-stroke` makes the mark immune to that.
 */
function Dot({
  x,
  y,
  size,
  color,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  return (
    <polyline
      points={`${x},${y} ${x},${y}`}
      fill="none"
      stroke={color}
      strokeWidth={size}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function LegendItem({ color, children }: { color: string; children: string }) {
  return (
    <div className="flex items-center gap-[6px] text-[11.5px] text-ink2">
      <span className="size-[9px] rounded-[3px]" style={{ background: color }} />
      {children}
    </div>
  );
}

export function InsightsDesktop() {
  const { planId } = useParams();
  const plans = useLiveQuery(() => workoutPlanRepo.listByCreatedDesc(), []);

  const plan = planId
    ? (plans?.find((candidate) => candidate.id === planId) ?? null)
    : (plans?.[0] ?? null);

  const exercises = useMemo(() => (plan ? trackedExercises(plan) : []), [plan]);
  const [exercise, setExercise] = useState<string | null>(null);

  useEffect(() => {
    setExercise(exercises[0] ?? null);
  }, [plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = exercise && exercises.includes(exercise) ? exercise : exercises[0];

  const stats = useMemo(() => (plan ? weeklyStats(plan) : []), [plan]);
  const oneRm = useMemo(
    () => (plan && selected ? exercise1RMSeries(plan, selected) : []),
    [plan, selected],
  );

  if (plans === undefined) {
    return <div className="text-[13px] text-ink3">Loading…</div>;
  }

  if (!plan || stats.length === 0) {
    return (
      <div>
        <PageHeader title="Insights" />
        <EmptyState emoji="📈" title="Nothing to chart yet">
          Insights read from a workout block's logged sets.{' '}
          <Link to="/workout" className="font-semibold text-honeyd">
            Import a workout →
          </Link>
        </EmptyState>
      </div>
    );
  }

  const labels = stats.map((stat) => `Wk ${stat.week}`);
  const bars = scaleBars(stats.map((stat) => stat.volume));
  const kcalLine = scaleSeries(stats.map((stat) => stat.kcal));

  // The handoff's ±6kg pad: a lift that only moves a couple of kilos should read
  // as a gentle climb, not a cliff.
  const rmScale = scaleSeries(
    oneRm.map((point) => point.oneRm),
    6,
  );
  const currentRm = oneRm.length > 0 ? oneRm[oneRm.length - 1].oneRm : null;
  const rmDelta =
    oneRm.length >= 2 ? oneRm[oneRm.length - 1].oneRm - oneRm[0].oneRm : null;

  const peakVolume = compactNumber(Math.max(...stats.map((s) => s.volume), 0));
  const totalKcal = compactNumber(stats.reduce((sum, s) => sum + s.kcal, 0));
  const rmLabels = oneRm.map((point) => `Wk ${point.week}`);

  return (
    <div>
      <PageHeader title="Insights" subtitle={`${plan.title} · week-over-week trends`} />

      <div className="grid grid-cols-4 gap-[15px]">
        <StatCard
          accent
          label={`Current 1RM${selected ? ` · ${selected}` : ''}`}
          value={currentRm ?? '—'}
          unit={currentRm ? 'kg' : undefined}
          sub={
            rmDelta != null ? (
              <>
                <span
                  className={`font-bold ${rmDelta >= 0 ? 'text-sage' : 'text-terra'}`}
                >
                  {rmDelta >= 0 ? '▲' : '▼'} {Math.abs(rmDelta)}kg
                </span>{' '}
                / block
              </>
            ) : (
              'needs two weeks of sets'
            )
          }
        />
        <StatCard
          label="Peak volume"
          value={peakVolume.value}
          unit={`${peakVolume.unit} kg`}
          sub={`Week ${stats.reduce((best, s) => (s.volume > best.volume ? s : best), stats[0]).week}`}
        />
        <StatCard
          label="Total burned"
          value={totalKcal.value}
          unit={`${totalKcal.unit} kcal`}
          sub={`${stats.length} week${stats.length === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Adherence"
          value={adherencePct(plan)}
          unit="%"
          sub="sessions completed"
        />
      </div>

      <div className="mt-[15px] grid grid-cols-2 gap-[15px]">
        <NCard>
          <CardHeader title="Weekly volume & calories">
            <div className="flex items-center gap-4">
              <LegendItem color={MACRO_COLORS.carbs}>Volume</LegendItem>
              <LegendItem color={MACRO_COLORS.protein}>Calories</LegendItem>
            </div>
          </CardHeader>
          <svg
            className="block h-[200px] w-full"
            viewBox={`0 0 ${CHART.width} ${CHART.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Weekly training volume and estimated calories"
          >
            <ChartFrame labels={labels} />
            {bars.map((bar, index) => (
              <rect
                key={index}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx="5"
                fill="#f5a114"
              />
            ))}
            <polyline
              points={kcalLine.polyline}
              fill="none"
              stroke="#6f9060"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {kcalLine.points.map((point, index) => (
              <Dot key={index} x={point.x} y={point.y} size={7} color="#6f9060" />
            ))}
          </svg>
        </NCard>

        <NCard>
          <CardHeader title="Estimated 1RM">
            {exercises.length > 0 && (
              <div className="relative after:pointer-events-none after:absolute after:right-[11px] after:top-1/2 after:-translate-y-1/2 after:text-[11px] after:text-ink3 after:content-['▾']">
                <select
                  value={selected}
                  onChange={(event) => setExercise(event.target.value)}
                  aria-label="Exercise"
                  className="cursor-pointer appearance-none rounded-[10px] border border-line2 bg-card2 py-[7px] pl-3 pr-[30px] text-[12.5px] font-semibold text-ink outline-0"
                >
                  {exercises.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </CardHeader>

          {oneRm.length === 0 ? (
            <p className="text-[13px] leading-[1.55] text-ink2">
              No strength sets with both weight and reps yet — that's what the Epley
              estimate needs.
            </p>
          ) : (
            <>
              <svg
                className="block h-[200px] w-full"
                viewBox={`0 0 ${CHART.width} ${CHART.height}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`Estimated one-rep max for ${selected}`}
              >
                <ChartFrame labels={rmLabels} />
                <polyline
                  points={rmScale.polyline}
                  fill="none"
                  stroke="#f5a114"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {rmScale.points.map((point, index) => (
                  <Dot key={index} x={point.x} y={point.y} size={8} color="#c2740a" />
                ))}
              </svg>
              <p className="mt-1 text-[12.5px] text-ink2">
                Epley formula ·{' '}
                {rmDelta == null ? (
                  <>one week of data so far — no trend yet.</>
                ) : (
                  <>
                    {selected} {rmDelta >= 0 ? 'climbed' : 'dropped'}{' '}
                    <b
                      className={`font-mono ${rmDelta >= 0 ? 'text-sage' : 'text-terra'}`}
                    >
                      {Math.abs(rmDelta)}kg
                    </b>{' '}
                    over the block.
                  </>
                )}
              </p>
            </>
          )}
        </NCard>
      </div>
    </div>
  );
}
