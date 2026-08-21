import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { EmptyState, NButton, PageHeader } from '@/components/nectar/primitives';
import { recipeRepo } from '@/lib/db/repositories';
import type { Recipe } from '@/lib/db/types';
import { RecipeGenerator } from '../RecipeGenerator';

/**
 * Recipes have no stored image (the data model carries no photo field), so the
 * card's image area is a deterministic honey-toned tile keyed off the title —
 * stable per recipe, and better than the prototype's placeholder hatch.
 */
function RecipeTile({ recipe }: { recipe: Recipe }) {
  const seed = [...recipe.title].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  // A narrow amber band keeps the grid cohesive; going past ~46° reads olive
  // once the dark theme drops the lightness.
  const hue = 30 + (seed % 15);
  const emoji = pickEmoji(recipe);

  return (
    <div
      className="flex h-[118px] items-center justify-center border-b border-line"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} var(--tile-sat) var(--tile-l1)), hsl(${hue + 8} var(--tile-sat) var(--tile-l2)))`,
      }}
    >
      <span className="text-[44px] opacity-90" aria-hidden>
        {emoji}
      </span>
    </div>
  );
}

function pickEmoji(recipe: Recipe): string {
  const haystack = `${recipe.title} ${recipe.tags.join(' ')}`.toLowerCase();
  const table: Array<[string[], string]> = [
    [['pancake', 'waffle', 'oat', 'porridge', 'granola'], '🥞'],
    [['salmon', 'fish', 'tuna', 'cod', 'prawn', 'shrimp'], '🐟'],
    [['chicken', 'turkey'], '🍗'],
    [['beef', 'steak', 'burger'], '🥩'],
    [['salad', 'greens', 'bowl'], '🥗'],
    [['soup', 'chili', 'stew', 'curry'], '🍲'],
    [['pasta', 'noodle', 'spaghetti'], '🍝'],
    [['yogurt', 'parfait', 'smoothie', 'shake'], '🥤'],
    [['egg', 'omelette', 'frittata'], '🍳'],
    [['rice', 'burrito', 'wrap', 'taco'], '🌯'],
  ];
  for (const [keywords, emoji] of table) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return emoji;
  }
  return '🍽️';
}

export function CookbookDesktop() {
  const recipes = useLiveQuery(() => recipeRepo.listByCreatedDesc(), []);
  const [generating, setGenerating] = useState(false);

  const count = recipes?.length ?? 0;

  return (
    <div>
      <PageHeader
        title="Cookbook"
        subtitle={
          count > 0
            ? `${count} recipe${count === 1 ? '' : 's'} · saved with per-serving macros`
            : 'Generate or import recipes and save them with macros per serving.'
        }
      >
        <NButton variant="primary" onClick={() => setGenerating((current) => !current)}>
          ✨ Generate recipe
        </NButton>
      </PageHeader>

      {(generating || count === 0) && (
        <div className="legacy-surface mb-4 max-w-[720px]">
          <RecipeGenerator />
        </div>
      )}

      {count === 0 ? (
        <EmptyState emoji="📖" title="Your cookbook is empty">
          Generate a recipe above, or paste one from your own Claude/ChatGPT
          subscription — either way it lands here with macros per serving.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-[15px]">
          {recipes?.map((recipe) => (
            <Link
              key={recipe.id}
              to={`/cookbook/${recipe.id}`}
              className="overflow-hidden rounded-[14px] border border-line bg-card transition duration-[120ms] hover:-translate-y-[2px] hover:shadow-[0_10px_24px_-14px_rgba(60,40,10,.5)]"
            >
              <RecipeTile recipe={recipe} />
              <div className="px-[13px] py-3">
                <div className="text-[13.5px] font-bold text-ink">{recipe.title}</div>
                <div className="mt-[3px] font-mono text-[11px] text-ink3">
                  {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}
                </div>
                {recipe.macrosPerServing && (
                  <div className="mt-2 font-mono text-[11.5px] font-bold text-honeydd">
                    {Math.round(recipe.macrosPerServing.kcal)} kcal · P
                    {Math.round(recipe.macrosPerServing.protein)} C
                    {Math.round(recipe.macrosPerServing.carbs)} F
                    {Math.round(recipe.macrosPerServing.fat)}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
