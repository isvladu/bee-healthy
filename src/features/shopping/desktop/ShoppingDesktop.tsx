import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckBox,
  EmptyState,
  Label,
  NButton,
  NCard,
  PageHeader,
} from '@/components/nectar/primitives';
import { cx } from '@/components/nectar/tokens';
import { dietPlanRepo, shoppingListRepo } from '@/lib/db/repositories';
import { pickActivePlan } from '@/lib/diet/activePlan';
import { buildShoppingList, CATEGORY_ORDER } from '@/lib/shopping/buildShoppingList';

function formatQuantity(quantity?: number, unit?: string): string {
  if (quantity == null) return unit ?? '';
  const rounded = Math.round(quantity * 10) / 10;
  return unit ? `${rounded} ${unit}` : `${rounded}`;
}

export function ShoppingDesktop() {
  const { planId } = useParams();
  const plans = useLiveQuery(() => dietPlanRepo.listByCreatedDesc(), []);

  const plan = planId
    ? (plans?.find((candidate) => candidate.id === planId) ?? null)
    : pickActivePlan(plans);

  const list = useLiveQuery(
    () => (plan ? shoppingListRepo.getByPlan(plan.id) : undefined),
    [plan?.id],
  );

  // Build the list once from the plan the first time it's opened. Deterministic
  // and LLM-free, so it works offline exactly like the mobile view.
  const ensuredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!plan || ensuredFor.current === plan.id) return;
    ensuredFor.current = plan.id;
    void (async () => {
      const existing = await shoppingListRepo.getByPlan(plan.id);
      if (!existing) await shoppingListRepo.create(buildShoppingList(plan));
    })();
  }, [plan]);

  if (plans === undefined) {
    return <div className="text-[13px] text-ink3">Loading…</div>;
  }

  if (!plan) {
    return (
      <div>
        <PageHeader title="Shopping list" />
        <EmptyState emoji="🛒" title="No plan to shop for yet">
          A shopping list is built from a diet plan's ingredients.{' '}
          <Link to="/diet" className="font-semibold text-honeyd">
            Generate a plan →
          </Link>
        </EmptyState>
      </div>
    );
  }

  if (!list) {
    return <div className="text-[13px] text-ink3">Preparing your shopping list…</div>;
  }

  const total = list.items.length;
  const checked = list.items.filter((item) => item.checked).length;
  const left = total - checked;
  const pct = total ? Math.round((checked / total) * 100) : 0;

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: list.items.filter((item) => (item.category ?? 'Other') === category),
  })).filter((group) => group.items.length > 0);

  return (
    <div>
      <PageHeader
        title="Shopping list"
        subtitle={`Generated from ${plan.title} · works offline`}
      >
        <NButton
          onClick={() => shoppingListRepo.setAllChecked(list.id, false)}
          disabled={checked === 0}
        >
          ↺ Reset
        </NButton>
      </PageHeader>

      <div className="mb-4 flex items-center gap-[14px] rounded-[14px] border border-line2 bg-card2 px-4 py-[14px]">
        <div className="flex min-w-[280px] flex-1 items-center gap-3">
          <div className="flex h-[11px] flex-1 overflow-hidden rounded-full border border-line bg-card">
            <div
              className="bg-honey transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="whitespace-nowrap font-mono text-[13px] font-bold text-ink">
            {checked}/{total}
          </span>
        </div>
        <span className="text-[12.5px] text-ink2">
          {left === 0 ? 'All done — happy cooking 🐝' : `${left} items left`}
        </span>
      </div>

      <div className="grid grid-cols-2 items-start gap-[15px]">
        {groups.map((group) => {
          const groupChecked = group.items.filter((item) => item.checked).length;
          return (
            <NCard key={group.category}>
              <div className="mb-[6px] flex items-center justify-between">
                <Label>{group.category}</Label>
                <span className="font-mono text-[10.5px] font-bold text-ink3">
                  {groupChecked}/{group.items.length}
                </span>
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.checked}
                  onClick={() => shoppingListRepo.toggleItem(list.id, item.id)}
                  className="flex w-full cursor-pointer items-center gap-3 border-b border-dashed border-line py-[9px] text-left last:border-b-0"
                >
                  <CheckBox checked={item.checked} />
                  <span
                    className={cx(
                      'text-[13.5px] font-medium',
                      item.checked ? 'text-ink3 line-through' : 'text-ink',
                    )}
                  >
                    {item.name}
                  </span>
                  <span className="ml-auto font-mono text-[11.5px] text-ink3">
                    {formatQuantity(item.quantity, item.unit)}
                  </span>
                </button>
              ))}
            </NCard>
          );
        })}
      </div>
    </div>
  );
}
