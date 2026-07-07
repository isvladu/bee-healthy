import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { bodyMetricsRepo } from './bodyMetricsRepo';
import { settingsRepo } from './settingsRepo';

beforeEach(async () => {
  // Reset the shared in-memory DB between tests; reopening re-runs `populate`.
  await db.delete();
  await db.open();
});

describe('settingsRepo', () => {
  it('seeds default settings on DB creation', async () => {
    const settings = await settingsRepo.getOrCreate();
    expect(settings.id).toBe('app');
    expect(settings.llmProvider).toBe('anthropic');
    expect(settings.llmModel).toBe('claude-sonnet-4-6');
    expect(settings.onboardingComplete).toBe(false);
  });

  it('persists updates and stamps syncStatus + updatedAt', async () => {
    const before = await settingsRepo.getOrCreate();
    await settingsRepo.update({ weightKg: 80, onboardingComplete: true });

    const after = await settingsRepo.get();
    expect(after?.weightKg).toBe(80);
    expect(after?.onboardingComplete).toBe(true);
    expect(after?.syncStatus).toBe('pending');
    expect(after?.updatedAt).not.toBe(before.createdAt);
  });
});

describe('bodyMetricsRepo', () => {
  it('creates then updates a single entry per date', async () => {
    await bodyMetricsRepo.upsertForDate('2026-07-07', { weightKg: 80 });
    await bodyMetricsRepo.upsertForDate('2026-07-07', { weightKg: 79.5 });

    const all = await bodyMetricsRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0].weightKg).toBe(79.5);
  });

  it('creates separate entries for different dates and lists newest first', async () => {
    await bodyMetricsRepo.upsertForDate('2026-07-06', { weightKg: 81 });
    await bodyMetricsRepo.upsertForDate('2026-07-07', { weightKg: 80 });

    const desc = await bodyMetricsRepo.listByDateDesc();
    expect(desc.map((m) => m.date)).toEqual(['2026-07-07', '2026-07-06']);
  });
});
