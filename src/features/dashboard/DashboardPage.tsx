import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '@/components/Card';
import { useSettings } from '@/hooks/useSettings';
import { bodyMetricsRepo } from '@/lib/db/repositories';
import { computeEnergy } from '@/lib/nutrition/energy';

// Lazy so recharts stays out of the initial bundle; only mounted when there's data.
const WeightTrendCard = lazy(() =>
  import('@/features/insights/WeightTrendCard').then((m) => ({
    default: m.WeightTrendCard,
  })),
);

const quickLinks = [
  { to: '/diet', emoji: '🥗', label: 'Plan a diet', hint: 'Macros & shopping list' },
  { to: '/workout', emoji: '🏋️', label: 'Log a workout', hint: 'Import & track weekly' },
  { to: '/cookbook', emoji: '📖', label: 'Cookbook', hint: 'Saved recipes' },
  { to: '/settings', emoji: '⚙️', label: 'Settings', hint: 'Your profile & AI key' },
];

export function DashboardPage() {
  const settings = useSettings();
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

  const metrics = useLiveQuery(() => bodyMetricsRepo.listByDateDesc(), []);
  const weightPointCount = (metrics ?? []).filter((m) => m.weightKg != null).length;

  const showOnboarding = settings != null && !settings.onboardingComplete;

  return (
    <section className="space-y-5">
      <Card className="bg-gradient-to-br from-honey-400 to-honey-600 text-white">
        <h2 className="text-lg font-bold">Welcome to Bee Healthy</h2>
        <p className="mt-1 text-sm text-white/90">
          Your offline-first diet & workout companion.
        </p>
      </Card>

      {showOnboarding && (
        <Link to="/settings" className="block">
          <Card className="border-honey-300 bg-honey-100/60 transition active:scale-[0.99]">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                👋
              </span>
              <div>
                <div className="font-semibold text-honey-800">
                  Complete your profile
                </div>
                <div className="text-sm text-honey-900/60">
                  Add your body stats to get a personalized calorie target.
                </div>
              </div>
            </div>
          </Card>
        </Link>
      )}

      {energy && (
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-honey-900/50">
            Daily calorie target
          </div>
          <div className="mt-1 text-3xl font-bold text-honey-700">
            {energy.target.toLocaleString()}{' '}
            <span className="text-base font-medium text-honey-900/50">kcal</span>
          </div>
          <div className="mt-1 text-sm text-honey-900/60">
            Maintenance ~{energy.tdee.toLocaleString()} kcal/day
          </div>
        </Card>
      )}

      {weightPointCount >= 2 && (
        <Suspense fallback={<Card>Loading chart…</Card>}>
          <WeightTrendCard />
        </Suspense>
      )}

      <div className="grid grid-cols-2 gap-3">
        {quickLinks.map((link) => (
          <Link key={link.to} to={link.to} className="block">
            <Card className="h-full transition-transform active:scale-[0.98]">
              <div className="text-2xl" aria-hidden>
                {link.emoji}
              </div>
              <div className="mt-2 text-sm font-semibold text-honey-800">
                {link.label}
              </div>
              <div className="text-xs text-honey-900/50">{link.hint}</div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
