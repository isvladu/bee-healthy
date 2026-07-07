import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { Card } from '@/components/Card';
import { dietPlanRepo } from '@/lib/db/repositories';
import { averageDailyCalories } from '@/lib/diet/planMapper';
import { DietPlanner } from './DietPlanner';

export function DietPage() {
  const plans = useLiveQuery(() => dietPlanRepo.listByCreatedDesc(), []);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-honey-800">Diet</h2>
        <p className="mt-1 text-sm text-honey-900/60">
          Generate a plan with macros, then review it day by day.
        </p>
      </div>

      <DietPlanner />

      {plans && plans.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-honey-900/60">Your plans</h3>
          {plans.map((plan) => (
            <Link key={plan.id} to={`/diet/${plan.id}`} className="block">
              <Card className="transition active:scale-[0.99]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-honey-800">{plan.title}</div>
                    <div className="text-xs text-honey-900/50">
                      {plan.durationDays} days ·{' '}
                      {format(new Date(`${plan.startDate}T00:00:00`), 'MMM d')}
                      {averageDailyCalories(plan) > 0 &&
                        ` · avg ${averageDailyCalories(plan).toLocaleString()} kcal`}
                    </div>
                  </div>
                  <span className="text-honey-400" aria-hidden>
                    →
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
