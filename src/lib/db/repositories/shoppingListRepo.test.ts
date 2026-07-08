import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { shoppingListRepo } from './shoppingListRepo';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function draft() {
  return {
    dietPlanId: 'plan-1',
    title: 'Test list',
    items: [
      { id: 'a', name: 'Eggs', checked: false },
      { id: 'b', name: 'Rice', checked: false },
    ],
  };
}

describe('shoppingListRepo', () => {
  it('finds a list by plan and toggles an item', async () => {
    const created = await shoppingListRepo.create(draft());

    const found = await shoppingListRepo.getByPlan('plan-1');
    expect(found?.id).toBe(created.id);

    await shoppingListRepo.toggleItem(created.id, 'a');
    const after = await shoppingListRepo.get(created.id);
    expect(after?.items.find((i) => i.id === 'a')?.checked).toBe(true);
    expect(after?.items.find((i) => i.id === 'b')?.checked).toBe(false);
  });

  it('sets all items checked / unchecked', async () => {
    const created = await shoppingListRepo.create(draft());
    await shoppingListRepo.setAllChecked(created.id, true);
    const list = await shoppingListRepo.get(created.id);
    expect(list?.items.every((i) => i.checked)).toBe(true);
  });
});
