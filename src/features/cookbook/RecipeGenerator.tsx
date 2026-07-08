import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Field, NumberInput, Segmented } from '@/components/form';
import { useLLMClient } from '@/hooks/useLLMClient';
import { useSettings } from '@/hooks/useSettings';
import { recipeRepo } from '@/lib/db/repositories';
import type { AppSettings } from '@/lib/db/types';
import { toRecipeDraft } from '@/lib/recipe/recipeMapper';
import type { LLMClient } from '@/lib/llm';
import { LLMError } from '@/lib/llm';
import {
  buildRecipePrompt,
  buildRecipeSubscriptionPrompt,
  RECIPE_SYSTEM_PROMPT,
} from '@/lib/llm/prompts/recipe';
import { GeneratedRecipeSchema } from '@/lib/llm/schemas/recipe';
import { parseImportedRecipe } from '@/lib/llm/schemas/recipeImport';

type Method = 'api' | 'subscription';

export function RecipeGenerator() {
  const client = useLLMClient();
  const settings = useSettings();
  if (!settings) {
    return (
      <Card>
        <p className="text-sm text-honey-900/60">Loading…</p>
      </Card>
    );
  }
  return <RecipeForm settings={settings} client={client} />;
}

function RecipeForm({
  settings,
  client,
}: {
  settings: AppSettings;
  client: LLMClient | null;
}) {
  const navigate = useNavigate();
  const [request, setRequest] = useState('');
  const [servingsInput, setServingsInput] = useState('2');
  const [method, setMethod] = useState<Method>('api');
  const [pasted, setPasted] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy'>('idle');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const servings = Math.max(1, Number.parseInt(servingsInput, 10) || 1);
  const country = settings.country;
  const avoid = settings.dietaryExclusions;

  async function saveRecipe(
    origin: string,
    source: Parameters<typeof toRecipeDraft>[0],
  ) {
    const recipe = await recipeRepo.create(toRecipeDraft(source, origin));
    navigate(`/cookbook/${recipe.id}`);
  }

  async function handleGenerate() {
    if (!client || !request.trim()) {
      setError('Describe the recipe you want first.');
      return;
    }
    setStatus('busy');
    setError('');
    try {
      const generated = await client.generateStructured({
        system: RECIPE_SYSTEM_PROMPT,
        prompt: buildRecipePrompt({ request, servings, country, avoid }),
        schema: GeneratedRecipeSchema,
        maxTokens: 2000,
      });
      await saveRecipe('Claude (API)', generated);
    } catch (err) {
      setError(err instanceof LLMError ? err.message : 'Could not generate a recipe.');
      setStatus('idle');
    }
  }

  async function handleCopy() {
    if (!request.trim()) {
      setError('Describe the recipe you want first.');
      return;
    }
    setError('');
    try {
      await navigator.clipboard.writeText(
        buildRecipeSubscriptionPrompt({ request, servings, country, avoid }),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — select and copy the prompt manually.');
    }
  }

  async function handleImport() {
    setError('');
    setStatus('busy');
    try {
      const parsed = parseImportedRecipe(pasted);
      await saveRecipe('Imported', parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that text.');
      setStatus('idle');
    }
  }

  const busy = status === 'busy';

  return (
    <Card className="space-y-4">
      <h3 className="font-semibold text-honey-800">New recipe</h3>

      <Field label="What do you want to cook?" hint="e.g. “high-protein breakfast scramble”">
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={2}
          placeholder="Describe the recipe…"
          className="w-full rounded-xl border border-honey-200 bg-white px-3 py-2 text-honey-900 outline-none transition focus:border-honey-400 focus:ring-2 focus:ring-honey-200"
        />
      </Field>

      <Field label="Servings">
        <NumberInput
          value={servingsInput}
          min={1}
          max={12}
          step={1}
          onChange={(e) => setServingsInput(e.target.value)}
          onBlur={() => setServingsInput(String(servings))}
        />
      </Field>

      {(country || avoid) && (
        <p className="text-xs text-honey-900/50">
          Applying your allergies/country from Settings.
        </p>
      )}

      <div>
        <Segmented<Method>
          value={method}
          onChange={setMethod}
          options={[
            { value: 'api', label: 'API key' },
            { value: 'subscription', label: 'Claude / ChatGPT' },
          ]}
        />
      </div>

      {method === 'api' ? (
        client ? (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
            className="rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? 'Generating…' : 'Generate recipe'}
          </button>
        ) : (
          <p className="text-sm text-honey-900/70">
            Add your Claude API key in{' '}
            <Link to="/settings" className="font-semibold text-honey-600 underline">
              Settings
            </Link>
            , or use the <strong>Claude / ChatGPT</strong> tab.
          </p>
        )
      ) : (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-honey-900/70">
            <li>Copy the prompt.</li>
            <li>Paste it into Claude or ChatGPT and send.</li>
            <li>Paste the JSON reply below and Import.</li>
          </ol>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98]"
            >
              Copy prompt
            </button>
            {copied && (
              <span className="text-sm font-medium text-green-600" role="status">
                Copied ✓
              </span>
            )}
          </div>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={5}
            placeholder="Paste the JSON reply from Claude / ChatGPT here…"
            className="w-full rounded-xl border border-honey-200 bg-white px-3 py-2 font-mono text-xs text-honey-900 outline-none transition focus:border-honey-400 focus:ring-2 focus:ring-honey-200"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={busy || pasted.trim() === ''}
            className="rounded-xl border border-honey-300 px-4 py-2 font-semibold text-honey-700 transition hover:bg-honey-100 disabled:opacity-60"
          >
            {busy ? 'Importing…' : 'Import recipe'}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
