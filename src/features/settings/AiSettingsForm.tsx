import { useState } from 'react';
import { Card } from '@/components/Card';
import { Field, Select } from '@/components/form';
import { settingsRepo } from '@/lib/db/repositories';
import type { AppSettings, LLMProvider } from '@/lib/db/types';
import { ANTHROPIC_MODELS, createLLMClient, LLMError } from '@/lib/llm';

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export function AiSettingsForm({ settings }: { settings: AppSettings }) {
  const provider: LLMProvider = 'anthropic';
  const [apiKey, setApiKey] = useState(settings.apiKey ?? '');
  const [model, setModel] = useState(settings.llmModel);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  const connected = Boolean(settings.apiKey);

  function onKeyChange(value: string) {
    setApiKey(value);
    setSaved(false);
    setTest({ status: 'idle' });
  }

  async function handleSave() {
    await settingsRepo.update({
      apiKey: apiKey.trim() || undefined,
      llmModel: model,
      llmProvider: provider,
    });
    setSaved(true);
  }

  async function handleTest() {
    const key = apiKey.trim();
    if (!key) {
      setTest({ status: 'error', message: 'Enter an API key first.' });
      return;
    }
    setTest({ status: 'testing' });
    try {
      const client = createLLMClient({ provider, model, apiKey: key });
      const reply = await client.ping();
      setTest({ status: 'ok', message: reply });
    } catch (err) {
      const message =
        err instanceof LLMError ? err.message : 'Something went wrong.';
      setTest({ status: 'error', message });
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <span aria-hidden>🤖</span>
        <h3 className="font-semibold text-honey-800">AI assistant</h3>
        <span
          className={[
            'ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
            connected
              ? 'bg-green-100 text-green-700'
              : 'bg-honey-100 text-honey-700',
          ].join(' ')}
        >
          <span
            className={[
              'h-2 w-2 rounded-full',
              connected ? 'bg-green-500' : 'bg-honey-400',
            ].join(' ')}
            aria-hidden
          />
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <Field
        label="Anthropic API key"
        hint="Stored only on this device — never uploaded or synced. Get one at console.anthropic.com."
      >
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            onChange={(e) => onKeyChange(e.target.value)}
            className="w-full rounded-xl border border-honey-200 bg-white px-3 py-2 font-mono text-sm text-honey-900 outline-none transition focus:border-honey-400 focus:ring-2 focus:ring-honey-200"
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            className="shrink-0 rounded-xl border border-honey-200 px-3 text-sm font-medium text-honey-700 hover:bg-honey-100"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </Field>

      <Field label="Model">
        <Select value={model} onChange={(e) => setModel(e.target.value)}>
          {ANTHROPIC_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.hint}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98]"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={test.status === 'testing'}
          className="rounded-xl border border-honey-300 px-4 py-2 font-semibold text-honey-700 transition hover:bg-honey-100 disabled:opacity-60"
        >
          {test.status === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
        {saved && (
          <span className="text-sm font-medium text-green-600" role="status">
            Saved ✓
          </span>
        )}
      </div>

      {test.status === 'ok' && (
        <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700" role="status">
          ✓ Connection works: “{test.message}”
        </p>
      )}
      {test.status === 'error' && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {test.message}
        </p>
      )}
    </Card>
  );
}
