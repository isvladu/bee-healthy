import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '@/components/Card';
import { bodyMetricsRepo } from '@/lib/db/repositories';
import { WeightTrendChart } from './charts';

export function WeightTrendCard() {
  const metrics = useLiveQuery(() => bodyMetricsRepo.listByDateDesc(), []);

  const points = (metrics ?? [])
    .filter((m) => m.weightKg != null)
    .map((m) => ({ date: m.date, weightKg: Math.round(m.weightKg! * 10) / 10 }))
    .reverse(); // oldest → newest for the chart

  if (points.length < 2) return null;

  return (
    <Card className="space-y-2">
      <h3 className="font-semibold text-honey-800">Weight trend</h3>
      <WeightTrendChart data={points} />
    </Card>
  );
}
