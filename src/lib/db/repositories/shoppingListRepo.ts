import { db } from '../schema';
import type { ShoppingList } from '../types';
import { Repository } from './base';

class ShoppingListRepository extends Repository<ShoppingList> {
  getByPlan(dietPlanId: string): Promise<ShoppingList | undefined> {
    return this.table.where('dietPlanId').equals(dietPlanId).first();
  }

  async toggleItem(id: string, itemId: string): Promise<void> {
    const list = await this.get(id);
    if (!list) return;
    const items = list.items.map((item) =>
      item.id === itemId ? { ...item, checked: !item.checked } : item,
    );
    await this.update(id, { items });
  }

  async setAllChecked(id: string, checked: boolean): Promise<void> {
    const list = await this.get(id);
    if (!list) return;
    await this.update(id, {
      items: list.items.map((item) => ({ ...item, checked })),
    });
  }
}

export const shoppingListRepo = new ShoppingListRepository(db.shoppingLists);
