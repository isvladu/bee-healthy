# CLAUDE.md

Guidance for AI agents (and humans) working in the **Bee Healthy** repo.

## What this is

Bee Healthy is a **PWA** for tracking diet and workouts with an LLM assistant (diet planning,
macros, interactive shopping lists, a recipe cookbook, workout import, and improvement insights).
It is **local-first** (works offline) with optional cloud sync.

The full architecture and build plan live in **`docs/IMPLEMENTATION_PLAN.md`** — read it before
making structural changes. Note: **`docs/` is gitignored and private** — do not push it to a public
remote, and do not put secrets there.

## Stack (do not swap without discussion)

- **Vite + React + TypeScript** (strict), installable PWA via **`vite-plugin-pwa`**
- **Tailwind CSS** for styling
- **Dexie / IndexedDB** — local-first source of truth for the UI
- **Supabase** (Postgres + Auth) — multi-device sync (added in a later phase)
- **`@anthropic-ai/sdk`** — LLM calls, **BYO key**, called directly from the browser
- **`zod`** — validate form input and all structured LLM output
- Package manager: use whatever `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` is present.

## Core principles

1. **Local-first.** Every user action reads/writes **Dexie first** so the app works fully offline.
   Sync to Supabase is a background reconciliation, never on the critical path.
2. **Provider abstraction.** All LLM calls go through the `LLMClient` interface
   (`src/lib/llm/client.ts`). Never import `@anthropic-ai/sdk` directly outside `src/lib/llm/`.
3. **Validate LLM output.** Every structured LLM response is parsed with a `zod` schema before use.
   Treat model output as untrusted.
4. **Keep prompts co-located.** Prompt builders in `src/lib/llm/prompts/`, their schemas in
   `src/lib/llm/schemas.ts`.

## LLM / Anthropic conventions

This project uses **Claude**. When adding or changing Claude calls, follow these — they reflect the
current API and are easy to get wrong from memory:

- **Browser access:** construct the client with
  `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`. The SDK then sends the required
  `anthropic-dangerous-direct-browser-access: true` header. This is intentional for a personal
  BYO-key app.
- **Model IDs (exact strings, no date suffixes):**
  - Default: `claude-sonnet-4-6` (cost-effective for parsing, macros, shopping lists).
  - Heavy planning: `claude-opus-4-8` (selectable in settings for multi-week diet generation).
  - Cheap/fast: `claude-haiku-4-5` if a task is trivial.
- **Structured output:** call `client.messages.parse({ ..., output_config: { format: zodOutputFormat(schema) } })`
  and read `response.parsed_output` (this is what `LLMClient.generateStructured` does). **Import zod
  from `zod/v4`** (`import { z } from 'zod/v4'`) for any schema passed to the LLM — the Anthropic SDK's
  `zodOutputFormat` helper is built against zod's v4 core, and a v3 schema won't type-check. **Do not**
  use assistant-message prefills to force JSON — they return a 400 on current models.
- **Lazy loading:** the `@anthropic-ai/sdk` (and its `helpers/zod`) are dynamically imported inside
  `src/lib/llm/anthropic.ts` so they stay out of the initial bundle. `createLLMClient()` is synchronous
  and cheap; the SDK only loads on the first real call. Keep it that way — don't add a top-level
  `import … from '@anthropic-ai/sdk'`.
- **Client construction:** never build the SDK client outside `src/lib/llm/`. Use `useLLMClient()`
  (returns `null` until a key is set) in components, or `createLLMClient(config)` directly.
- **Two kinds of schema, don't mix them up:**
  - **API structured-output schemas** (e.g. `schemas/diet.ts`) are sent to Anthropic via
    `output_config.format`, so they must stay within the structured-outputs JSON Schema subset —
    no `.min/.max/.email`, no optional fields, keep them plain.
  - **Import schemas** (e.g. `schemas/dietImport.ts`) validate text pasted from a user's own
    Claude/ChatGPT subscription. They run **client-side only** (never sent to the API), so they may
    use the full zod feature set — `.optional()`, `.default()`, refinements, etc.
- **BYO-subscription flow:** users without an API key generate in their own Claude/ChatGPT app.
  The app builds a copy-paste prompt (`buildSubscriptionPrompt`) that asks for a single fenced JSON
  block; the pasted reply is parsed + validated (`parseImportedDietPlan`) and mapped through the same
  `toDietPlanDraft`. Imported plans may lack macros — the data model makes `Meal.macros` /
  `DietDay.totalMacros` optional, so **always guard macro rendering** (`{meal.macros && …}`).
- **Streaming:** use `client.messages.stream(...)` for the diet-planning chat and any large output;
  get the full result via `.finalMessage()`. Use a generous `max_tokens` (~64000) when streaming;
  ~16000 for non-streaming.
- **Thinking:** current models use adaptive thinking — `thinking: { type: 'adaptive' }`. There is no
  `budget_tokens` parameter on these models (it 400s).
- **Errors:** catch the SDK's typed error classes (`AuthenticationError` → "check your API key",
  `RateLimitError` → back off, `BadRequestError`, `APIConnectionError`) and show friendly messages.
- **Cost awareness:** the *user* pays for their own key. Prefer `claude-sonnet-4-6`, keep prompts
  tight, and don't fan out unnecessary calls.

> If you're unsure about an Anthropic API detail, consult the `claude-api` skill rather than
> guessing — several API shapes (thinking, structured output, model IDs) changed recently.

## Feature notes

- **Shopping list is deterministic (no LLM).** `lib/shopping/buildShoppingList.ts` aggregates a
  plan's items by name+unit and categorizes them with a keyword map, so it works fully offline and
  for imported plans with no API key. Don't route it through the LLM.
- **Recipes reuse the diet pattern.** Two schemas (API constraint-free `schemas/recipe.ts`, lenient
  client-side `schemas/recipeImport.ts`), two prompt builders, and the same copy-prompt → paste-JSON
  → import flow. Allergy/country constraints are shared via `prompts/constraints.ts`
  (`foodConstraintLines`) across diet and recipe prompts — extend there, not per-feature.
- **Workout import is deterministic-first.** `lib/workout/parseWorkout.ts` parses the raw string
  ("3x8 @60kg", week/session headers) with no LLM — instant and offline. "Parse with AI" is an
  optional fallback for messy formats (`schemas/workout.ts` flat schema → `aiMapper.ts`). Calories
  are MET-based (`lib/workout/calories.ts`); sessions are embedded in weeks (like diet days), and
  completion logging toggles a `completed` flag on the embedded session.

## Cloud sync (optional, Phase 7)

- **Optional & graceful.** `getSupabase()` returns `null` when `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` are unset; every sync path no-ops and the app stays local-only. Never
  make a feature hard-depend on Supabase being configured.
- **Generic sync.** One `records` table (jsonb, PK `(user_id, id)`, RLS by `auth.uid()`) mirrors all
  syncable Dexie stores. Strategy is last-write-wins by `updatedAt`. Schema: `supabase/migrations/`.
- **The API key must never sync.** `sanitizeForSync` strips `settings.apiKey` (and the local-only
  `syncStatus`) before upload; `mergeRemoteIntoLocal` preserves the on-device key on pull. If you add
  a device-only field, update both — and the `serialize.test.ts` cases.
- **Lazy-loaded.** `AccountSyncCard` (and thus `@supabase/supabase-js`) is `lazy()`-imported so it
  stays out of the initial bundle. Keep it that way.
- Known limitation: deletes are not tombstoned yet, so a delete on one device isn't propagated.

## Telemetry: errors + events (`/api/log`)

The repo has a small **server tier**: Vercel Serverless Functions in the root `api/` directory,
deployed automatically alongside the static build. `vite dev` does **not** run them — use
`vercel dev` to exercise `api/*` locally. Two client channels post there, sharing `sanitize.ts`
(redaction, truncation) and `transport.ts` (the fetch, the gate, the self-disable).

- **`reportError(err, { where, extra })`** (`telemetry/reportError.ts`) — something *threw*. Posts
  immediately (a crash may be seconds from unloading the page), one report per call.
- **`logEvent(level, event, fields)`** / **`logEventOnce(...)`** (`telemetry/logEvent.ts`) — something
  the app *quietly decided*: a fallback taken, a degraded mode entered, a parse that half-worked,
  a sync conflict that discarded a local edit. `level` is `'info' | 'warn'`. Events are **batched**
  (10 per request, or a 5s debounce, force-flushed on `pagehide`/`visibilitychange`).
- Event names are `category.subject.verb`, lowercase and dotted (`sync.conflict.pending_overwritten`).
  The first segment becomes the log line's `where`, so keep it a real category.
- **Never pass secrets or health content to either.** Each payload is a fixed whitelist —
  `buildErrorReport` (message, name, stack, where, route, userAgent, appVersion, timestamp, extra) and
  `buildEventReport` (level, message, where, route, appVersion, timestamp, extra). Arbitrary throwables
  are reduced to their *type*; `extra`/`fields` accept **primitives only** (objects collapse to
  `[object]`). Redaction on both client and server is a backstop, not the defense. **Fields must be
  counts, enums, durations, booleans** — never names, food text, exercise text, or dates. Validation
  failures report zod issue *paths* via `schemas/issuePaths.ts`, never `issue.message` (which embeds
  the received value). If you add a field, add a `reportError.test.ts` / `logEvent.test.ts` case
  proving what it can't leak.
- Report **alongside** existing user-facing error handling, never instead of it: report and rethrow so
  the friendly message still shows. Wired at `mapAnthropicError` (`llm`), the sync engine (`sync`),
  `AccountSyncCard` (`auth`), the global handlers + `ErrorBoundary` in `main.tsx`.
- `mapAnthropicError` routes `rate_limit` and `connection` to `logEvent('warn', 'llm.error.transient')`
  instead of `reportError` — being offline or throttled is an operating condition, not a defect, and it
  shouldn't burn the error budget.
- **Two independent caps per page load**: 20 errors, 40 events. An event storm can never starve error
  reporting. Both channels are off under `vite dev`; `VITE_ERROR_REPORTING` = `on` (enable in dev) /
  `off` (disable in prod) switches both. Events also `console.info`/`console.warn` in dev (not in tests).
- The endpoint is unauthenticated but cheap: POST + JSON only, 10 KB cap, best-effort same-origin check
  (`ERROR_LOG_ALLOWED_ORIGINS` for a custom domain), always answers `204` so the client never retries.
  It accepts a single object *or* an array (a batch, capped at 20), re-whitelists each entry
  independently, and routes by `level` — `warn` → `console.warn`, `info` → `console.log`, everything
  else → `console.error`. An absent or unknown `level` means `error`, so older clients keep working.
  Since the `204` is unconditional it can't tell you whether anything was logged, so the response
  carries **`x-log-entries`** with the count — `curl -i` answers that without the Vercel UI.
- The client **self-disables** on `401`, `404` and `405`: an auth gate in front of `/api` (Vercel
  Deployment Protection on previews) or a host with no `/api` tier will reject every later post
  identically, and retrying burns the whole page budget. **`403` deliberately does not disable** — it
  is our own origin check, so treating it as terminal would hide a misconfigured
  `ERROR_LOG_ALLOWED_ORIGINS` behind silence instead of logs.
- Import failures report a `stage` (`extract` | `json` | `schema` | `empty`). `extract` covers a paste
  with no `{…}` at all — it happens before the parser's first `try`, so it needs its own wrapper or it
  is silent, which is exactly the case you most want to see.
- Tests live next to the function (`api/log.test.ts`); `.vercelignore` keeps them out of the deploy,
  since Vercel routes every file under `api/`.
- Service-worker registration lives in `lib/pwa/registerSW.ts` (imported by `main.tsx`) so the
  lifecycle callbacks are reachable — `injectRegister: 'auto'` steps aside once the virtual module is
  imported, so `vite.config.ts` needs no change. Keep it that way.

## Security rules (non-negotiable)

- The user's **LLM API key lives only in Dexie `settings`** on-device. **Never** sync it to Supabase,
  log it, or write it to `docs/` or any committed file.
- Supabase must use **Row-Level Security** so a user can only read/write their own rows.
- Never commit real API keys, `.env` files with secrets, or Supabase service-role keys. Use
  `.env.example` for shape only.

## Data model

One Dexie store per entity; every record has `id` (uuid), `createdAt`, `updatedAt`, `syncStatus`.
Supabase mirrors these tables (minus the API key) with a `user_id` FK. See
`docs/IMPLEMENTATION_PLAN.md` §5 for the full schema.

## Conventions

- Match existing file/component patterns; feature code lives under `src/features/<feature>/`.
- Data access goes through repositories in `src/lib/db/repositories/` — components don't touch Dexie
  tables directly.
- Use `date-fns` for date/week math (workout tracking buckets by ISO week).
- Prefer React context + hooks; only reach for a state library if state genuinely outgrows that.

## Build / dev / test commands

> These are the intended scripts; confirm against `package.json` (they may not all exist yet in
> early phases). Add missing ones rather than inventing ad-hoc commands.

```bash
npm run dev        # Vite dev server
npm run build      # production build (static output in dist/)
npm run preview    # preview the production build (test PWA/offline here)
npm run lint       # ESLint
npm run test       # Vitest (unit/component)
npm run test:e2e   # Playwright (end-to-end)
```

## Verifying changes

- **Logic** (parsers, calorie math, repositories, schemas): add/adjust Vitest tests.
- **LLM features:** mock `LLMClient` in tests. For a real-key smoke test, use `npm run dev` and a
  test key entered in Settings — never hardcode a key.
- **PWA/offline:** use `npm run preview`, then DevTools → Network → Offline to confirm the app shell
  and Dexie-backed features still work.

## Build order

Follow the phases in `docs/IMPLEMENTATION_PLAN.md` §9 (scaffold → local data → LLM plumbing → diet →
shopping/cookbook → workout → insights → sync → polish). Each phase is independently verifiable.
