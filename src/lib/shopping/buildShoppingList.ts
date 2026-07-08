import type { DietPlan, ShoppingItem, ShoppingList } from '@/lib/db/types';

export type ShoppingListDraft = Omit<
  ShoppingList,
  'id' | 'createdAt' | 'updatedAt' | 'syncStatus'
>;

export const CATEGORY_ORDER = [
  'Produce',
  'Meat & Fish',
  'Dairy & Eggs',
  'Grains & Bakery',
  'Pantry',
  'Other',
] as const;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Produce: [
    'spinach', 'tomato', 'cucumber', 'pepper', 'zucchini', 'broccoli', 'onion',
    'garlic', 'banana', 'berry', 'berries', 'apple', 'lettuce', 'salad', 'avocado',
    'carrot', 'potato', 'mushroom', 'lemon', 'lime', 'fruit', 'vegetable', 'veg',
    'greens', 'kale', 'date', 'dates', 'orange', 'cauliflower', 'celery',
  ],
  'Meat & Fish': [
    'chicken', 'beef', 'turkey', 'pork', 'salmon', 'cod', 'tuna', 'fish', 'steak',
    'mince', 'lamb', 'shrimp', 'prawn', 'bacon', 'ham', 'sausage',
  ],
  'Dairy & Eggs': [
    'egg', 'milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cottage', 'cream',
    'whey',
  ],
  'Grains & Bakery': [
    'rice', 'oat', 'oats', 'bread', 'toast', 'pasta', 'noodle', 'quinoa',
    'tortilla', 'wrap', 'bagel', 'flour', 'cereal', 'couscous', 'bun',
  ],
  Pantry: [
    'olive oil', 'oil', 'honey', 'salt', 'pepper', 'spice', 'sauce', 'vinegar',
    'nut', 'walnut', 'almond', 'peanut', 'seed', 'cinnamon', 'sugar', 'stock',
    'broth', 'bean', 'chickpea', 'lentil', 'sports drink', 'protein', 'shake',
  ],
};

/** Best-effort keyword categorization of a food name. */
export function categorize(name: string): string {
  const n = name.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => n.includes(keyword))) return category;
  }
  return 'Other';
}

/**
 * Build a consolidated shopping list from a plan's meals. Items with the same name
 * and unit are merged and their quantities summed across the whole plan.
 */
export function buildShoppingList(plan: DietPlan): ShoppingListDraft {
  const byKey = new Map<string, ShoppingItem>();

  for (const day of plan.days) {
    for (const meal of day.meals) {
      for (const item of meal.items) {
        const unit = item.unit ?? '';
        const key = `${item.name.trim().toLowerCase()}|${unit.toLowerCase()}`;
        const existing = byKey.get(key);
        if (existing) {
          if (item.quantity != null) {
            existing.quantity = (existing.quantity ?? 0) + item.quantity;
          }
        } else {
          byKey.set(key, {
            id: crypto.randomUUID(),
            name: item.name.trim(),
            quantity: item.quantity,
            unit: item.unit,
            category: categorize(item.name),
            checked: false,
          });
        }
      }
    }
  }

  return {
    dietPlanId: plan.id,
    title: `Shopping list — ${plan.title}`,
    items: Array.from(byKey.values()),
  };
}
