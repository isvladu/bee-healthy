import { db } from '../schema';
import type { BodyMetric } from '../types';
import { Repository } from './base';

type BodyMetricData = Partial<Pick<BodyMetric, 'weightKg' | 'bodyFatPct' | 'note'>>;

class BodyMetricsRepository extends Repository<BodyMetric> {
  /** One entry per calendar day — update if today's already exists, else create. */
  async upsertForDate(date: string, data: BodyMetricData): Promise<void> {
    const existing = await this.table.where('date').equals(date).first();
    if (existing) {
      await this.update(existing.id, data);
    } else {
      await this.create({ date, ...data });
    }
  }

  /** Newest first, for charts and insights. */
  async listByDateDesc(): Promise<BodyMetric[]> {
    return this.table.orderBy('date').reverse().toArray();
  }
}

export const bodyMetricsRepo = new BodyMetricsRepository(db.bodyMetrics);
