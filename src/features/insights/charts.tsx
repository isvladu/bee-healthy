import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OneRmPoint, WeekStat } from '@/lib/workout/insights';

const HONEY = '#f59e0b';
const DARK = '#92400e';
const GRID = '#fde68a';
const AXIS = '#b45309';

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export function WeeklyProgressChart({ data }: { data: WeekStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis
          dataKey="week"
          tickFormatter={(w: number) => `W${w}`}
          stroke={AXIS}
          fontSize={12}
        />
        <YAxis yAxisId="v" stroke={AXIS} fontSize={12} />
        <YAxis yAxisId="k" orientation="right" stroke={DARK} fontSize={12} />
        <Tooltip />
        <Bar
          yAxisId="v"
          dataKey="volume"
          name="Volume (kg)"
          fill={HONEY}
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="k"
          dataKey="kcal"
          name="Est. kcal"
          stroke={DARK}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function OneRepMaxChart({ data }: { data: OneRmPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis
          dataKey="week"
          tickFormatter={(w: number) => `W${w}`}
          stroke={AXIS}
          fontSize={12}
        />
        <YAxis stroke={AXIS} fontSize={12} domain={['auto', 'auto']} />
        <Tooltip />
        <Line
          dataKey="oneRm"
          name="Est. 1RM (kg)"
          stroke={HONEY}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WeightTrendChart({ data }: { data: WeightPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => d.slice(5)}
          stroke={AXIS}
          fontSize={12}
        />
        <YAxis stroke={AXIS} fontSize={12} domain={['auto', 'auto']} />
        <Tooltip />
        <Line
          dataKey="weightKg"
          name="Weight (kg)"
          stroke={HONEY}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
