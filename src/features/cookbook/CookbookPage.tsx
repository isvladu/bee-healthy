import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '@/components/Card';
import { recipeRepo } from '@/lib/db/repositories';
import { MacroSummary } from '@/features/diet/components/MacroSummary';
import { RecipeGenerator } from './RecipeGenerator';

export function CookbookPage() {
  const recipes = useLiveQuery(() => recipeRepo.listByCreatedDesc(), []);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-honey-800">Cookbook</h2>
        <p className="mt-1 text-sm text-honey-900/60">
          Generate or import recipes and save them with macros per serving.
        </p>
      </div>

      <RecipeGenerator />

      {recipes && recipes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-honey-900/60">Saved recipes</h3>
          {recipes.map((recipe) => (
            <Link key={recipe.id} to={`/cookbook/${recipe.id}`} className="block">
              <Card className="transition active:scale-[0.99]">
                <div className="font-semibold text-honey-800">{recipe.title}</div>
                <div className="mt-0.5 text-xs text-honey-900/50">
                  {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}
                </div>
                {recipe.macrosPerServing && (
                  <div className="mt-1">
                    <MacroSummary macros={recipe.macrosPerServing} />
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
