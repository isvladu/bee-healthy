import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '@/components/Card';
import { dietPlanRepo, shoppingListRepo } from '@/lib/db/repositories';
import { buildShoppingList, CATEGORY_ORDER } from '@/lib/shopping/buildShoppingList';

export function ShoppingListView() {
  const { planId } = useParams();
  const plan = useLiveQuery(
    () => (planId ? dietPlanRepo.get(planId) : undefined),
    [planId],
  );
  const list = useLiveQuery(
    () => (planId ? shoppingListRepo.getByPlan(planId) : undefined),
    [planId],
  );
  const ensured = useRef(false);

  // Create the list once from the plan if it doesn't exist yet.
  useEffect(() => {
    if (!plan || ensured.current) return;
    ensured.current = true;
    void (async () => {
      const existing = await shoppingListRepo.getByPlan(plan.id);
      if (!existing) await shoppingListRepo.create(buildShoppingList(plan));
    })();
  }, [plan]);

  if (plan === null) {
    return (
      <Card>
        <p className="text-sm text-honey-900/70">
          Plan not found.{' '}
          <Link to="/diet" className="font-semibold text-honey-600 underline">
            Back to plans
          </Link>
        </p>
      </Card>
    );
  }
  if (!plan || !list) {
    return <Card>Preparing your shopping list…</Card>;
  }

  const checkedCount = list.items.filter((i) => i.checked).length;
  const total = list.items.length;
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: list.items.filter((i) => (i.category ?? 'Other') === category),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="space-y-4">
      <div>
        <Link to={`/diet/${plan.id}`} className="text-sm font-medium text-honey-600">
          ← {plan.title}
        </Link>
        <h2 className="mt-1 text-xl font-bold text-honey-800">Shopping list</h2>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-honey-100">
            <div
              className="h-full bg-honey-500 transition-all"
              style={{ width: total ? `${(checkedCount / total) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-sm text-honey-900/60">
            {checkedCount}/{total}
          </span>
          {checkedCount > 0 && (
            <button
              type="button"
              onClick={() => shoppingListRepo.setAllChecked(list.id, false)}
              className="text-sm font-medium text-honey-600"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {groups.map((group) => (
        <Card key={group.category} className="space-y-1">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-honey-900/50">
            {group.category}
          </h3>
          {group.items.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-3 py-1.5"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => shoppingListRepo.toggleItem(list.id, item.id)}
                className="h-5 w-5 shrink-0 accent-honey-500"
              />
              <span
                className={
                  item.checked
                    ? 'text-honey-900/40 line-through'
                    : 'text-honey-900/80'
                }
              >
                {item.name}
                {item.quantity != null && (
                  <span className="text-honey-900/50">
                    {' '}
                    — {Math.round(item.quantity * 10) / 10}
                    {item.unit ? ` ${item.unit}` : ''}
                  </span>
                )}
              </span>
            </label>
          ))}
        </Card>
      ))}
    </section>
  );
}
