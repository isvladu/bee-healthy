import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '@/components/Card';
import { recipeRepo } from '@/lib/db/repositories';
import { MacroSummary } from '@/features/diet/components/MacroSummary';

export function RecipeView() {
  const { recipeId } = useParams();
  const navigate = useNavigate();
  const recipe = useLiveQuery(
    () => (recipeId ? recipeRepo.get(recipeId) : undefined),
    [recipeId],
  );

  if (recipe === undefined) return <Card>Loading…</Card>;
  if (recipe === null) {
    return (
      <Card>
        <p className="text-sm text-honey-900/70">
          Recipe not found.{' '}
          <Link to="/cookbook" className="font-semibold text-honey-600 underline">
            Back to cookbook
          </Link>
        </p>
      </Card>
    );
  }

  async function handleDelete() {
    if (!recipe) return;
    await recipeRepo.remove(recipe.id);
    navigate('/cookbook');
  }

  return (
    <section className="space-y-4">
      <div>
        <Link to="/cookbook" className="text-sm font-medium text-honey-600">
          ← Cookbook
        </Link>
        <h2 className="mt-1 text-xl font-bold text-honey-800">{recipe.title}</h2>
        {recipe.description && (
          <p className="text-sm text-honey-900/60">{recipe.description}</p>
        )}
        <p className="mt-1 text-xs text-honey-900/50">
          {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}
          {recipe.source ? ` · ${recipe.source}` : ''}
        </p>
      </div>

      {recipe.macrosPerServing && (
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-honey-900/50">
            Per serving
          </div>
          <MacroSummary macros={recipe.macrosPerServing} size="lg" />
        </Card>
      )}

      <Card className="space-y-2">
        <h3 className="font-semibold text-honey-800">Ingredients</h3>
        <ul className="space-y-1">
          {recipe.ingredients.map((item, i) => (
            <li key={i} className="text-sm text-honey-900/80">
              {item.quantity != null && (
                <span className="font-medium">
                  {item.quantity}
                  {item.unit ? ` ${item.unit}` : ''}{' '}
                </span>
              )}
              {item.name}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-2">
        <h3 className="font-semibold text-honey-800">Steps</h3>
        <ol className="list-decimal space-y-2 pl-5">
          {recipe.steps.map((step, i) => (
            <li key={i} className="text-sm text-honey-900/80">
              {step}
            </li>
          ))}
        </ol>
      </Card>

      {recipe.notes && (
        <Card>
          <h3 className="mb-1 font-semibold text-honey-800">Notes</h3>
          <p className="text-sm text-honey-900/70">{recipe.notes}</p>
        </Card>
      )}

      <button
        type="button"
        onClick={handleDelete}
        className="text-sm font-medium text-red-600"
      >
        Delete recipe
      </button>
    </section>
  );
}
