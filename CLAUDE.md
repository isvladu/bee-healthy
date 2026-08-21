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
   (`src/lib/llm/client.ts`). Never import `@anthropic-ai/sdk` directly outside `src/lib/llm/`
   (client) or `api/_lib/anthropic.ts` (server — the owner's key, see “Hosted AI” below).
   There are two implementations: `AnthropicClient` (the user's key, browser → Anthropic) and
   `HostedClient` (no key, browser → our `/api/ai/*`). Features must not care which they got.
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

## Auth & cloud sync (self-managed, backend-mediated)

**The browser holds no database credential.** Supabase Auth is gone; we own identity. Our Vercel
Functions are the only thing that talks to Postgres, using the **service-role key** (server-only).
The client calls same-origin `/api/*` and carries an **httpOnly session cookie** it cannot read.

- **Optional & graceful, still.** With `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
  `SESSION_SECRET` unset, every endpoint answers `503 backend_unconfigured` and the app stays fully
  local-only. The client *discovers* this from `/api/auth/me` — there is no `VITE_` backend flag to
  drift out of step. Never make a feature hard-depend on the backend being configured.
- **Authorization lives in code, not RLS.** The service role bypasses RLS, so the real guard is
  a *scope*: `userScope(userId)` (`api/_lib/data.ts`, the `records` table) and `creditScope(userId)`
  (`api/_lib/credits.ts`, the ledger). Each captures the session user in a closure and **no method
  accepts a user id**. Never call `serviceClient().from(...)` for user-owned data directly — add a
  method to the relevant scope, and add the cross-user isolation test alongside it. RLS stays
  enabled with **no policies** on every table as defense in depth.
- **Sessions.** Opaque 256-bit token, only its HMAC stored in `app_sessions`; httpOnly + Secure +
  `SameSite=Lax`; sliding 30-day expiry; revocation = a row update, so logout is instant. Password
  reset revokes every session.
- **Passwords.** `crypto.scrypt` (N=65536), parameters stored per hash. Deliberately **not** peppered
  with `SESSION_SECRET` — losing that secret would brick every account, whereas peppering the
  *tokens* only signs everyone out.
- **CSRF.** `guardPost` requires POST + JSON + a matching `Origin` on every state-changing route,
  on top of `SameSite=Lax`. GET routes skip the Origin check (same-origin GETs don't send one).
- **No enumeration.** Login answers `invalid_credentials` identically for unknown email and wrong
  password, and **burns a scrypt hash on the miss path** so timing doesn't leak either.
  `request-reset` always answers 200. Signup is the deliberate exception (409 `email_taken`).
- **Generic sync, now server-mediated.** One `records` table (jsonb, PK `(user_id, id)`) mirrors all
  syncable Dexie stores; the client POSTs `/api/sync/push` and GETs `/api/sync/pull?since=…`.
  Last-write-wins by `updatedAt`. Pull is **paginated** — the server returns `complete: false` and
  the client keeps pulling rather than advancing its watermark past a truncated page.
- **The API key must never sync.** `sanitizeForSync` strips `settings.apiKey` (and the local-only
  `syncStatus`) client-side, and `stripDeviceOnlyFields` **strips it again server-side** — the browser
  is not something we get to trust. `mergeRemoteIntoLocal` preserves the on-device key on pull. If you
  add a device-only field, update all three — and the `serialize.test.ts` / `data.test.ts` cases.
- **`@supabase/supabase-js` is a server-side dependency now.** It stays in `dependencies` because
  Vercel Functions need it, but **never import it under `src/`** — `data.test.ts`-adjacent bundle
  checks aside, the build must keep it out of `dist/`.
- **Email** (verify + reset) goes through Resend in `api/_lib/mail.ts` and no-ops when
  `RESEND_API_KEY` is unset. Tokens are single-use, hashed at rest, and **never logged** —
  `MAIL_DEBUG=1` prints links for local dev only.
- Known limitation: deletes are still not tombstoned, so a delete on one device isn't propagated.
  The `records.deleted` column and both sync paths already handle tombstones — the missing piece is
  the client *emitting* one on delete.

### Server tier layout

- `api/_lib/` — shared server code. The `_` prefix is what keeps Vercel from turning these into
  routes; everything else under `api/` becomes a public endpoint, so put helpers here.
- **Relative imports inside `api/` need an explicit `.js` extension** (`'./_lib/http.js'`, even
  though the file is `.ts`). Vercel transpiles each function to ESM without bundling or rewriting
  specifiers, and `package.json` is `"type": "module"`, so an extensionless import throws
  `ERR_MODULE_NOT_FOUND` at runtime. `tsconfig.api.json` uses `moduleResolution: "nodenext"` so
  `tsc` catches this — don't relax it back to `"bundler"`, which is what let the bug ship.
- Tests live next to the code (`api/**/*.test.ts`) and `.vercelignore` keeps them out of the deploy.
- `vite dev` does **not** run `api/`. Use `vercel dev` to exercise auth and sync locally.
- Client/server constants that can't be imported across the two TS projects (password length,
  syncable types) are duplicated with a test that holds the copies together — see
  `src/lib/backend/limits.test.ts` and the `SYNCABLE_TYPES` case in `api/_lib/data.test.ts`.

## Hosted AI on the owner's key (`/api/ai/*`)

Users without their own Anthropic key can generate through **our** key, metered by a credit
ledger. BYO-key stays the unlimited power-user path and always wins when a key is present.

- **Optional, like everything else server-side.** With `ANTHROPIC_API_KEY` unset every AI route
  answers `503 hosted_ai_unconfigured` and the app behaves exactly as it did before — the client
  *discovers* this from `GET /api/ai/usage`, so there is no `VITE_` flag to drift.
- **Credits are money.** One credit = **one US cent of Anthropic list-price cost**, rounded up,
  minimum one per call (`api/_lib/pricing.ts`). Denominating in money rather than request counts
  is what lets the per-user quota and the owner's ceiling share a unit. Adding a model = adding a
  price row; an unpriced model is refused rather than billed at a guess.
- **Hold, then settle — always exactly once.** Cost is only known after the call, so
  `openHostedCall` reserves the worst case (`holdFor`: every allowed output token plus a
  deliberately fat input estimate) and `settleHostedCall` charges the real figure and refunds the
  rest. `settleHostedCall` **never throws** — the model has already been billed upstream, so a
  bookkeeping failure must not also cost the user their answer. Call it on every path, including
  errors and aborts. A cancelled stream is charged its *estimated* partial cost, not refunded,
  or repeated cancelling would be free money out of the owner's pocket.
- **Three ceilings**: per-user `app_credits` (topped up to `AI_FREE_MONTHLY_CREDITS` on the 1st —
  `greatest(balance, grant)`, so purchased credits are never reduced), the global `app_ai_spend`
  total vs `AI_MONTHLY_BUDGET_USD`, and a per-account burst limit (`AI_USER_LIMIT`, reusing
  `app_login_attempts`). Credits bound the *total* one account can spend, the burst limit bounds how
  fast. Unlike the auth limiters, this one counts **every accepted call** — each costs money whether
  it succeeds or not. The global ceiling is checked *before* the ledger is touched, so a request that
  was never going to run doesn't churn balances.
- **Hosted AI requires a verified email; sync does not.** It spends real money, and a throwaway
  signup would otherwise be free credits. Hosted models are Sonnet + Haiku only — Opus is BYO-key
  (`HOSTED_MODELS` in `api/_lib/pricing.ts`, mirrored by `HOSTED_MODEL_IDS` in
  `src/lib/llm/models.ts`, with `pricing.test.ts` holding the copies together).
- **Structured output keeps its schema client-side.** The browser renders its zod schema with the
  SDK's own `zodOutputFormat` (a dynamically-imported ~2 kB chunk, *not* the full SDK) and posts
  the JSON Schema; the server forwards it opaquely and the client validates the reply against the
  same zod schema. So a new AI feature needs **no server change**, and prompts/schemas stay
  co-located per feature. Don't "improve" this by duplicating schemas under `api/`.
- **Streaming is SSE, and mid-stream failures are in-band.** `POST /api/ai/chat` writes
  `data: {"type":"delta"|"done"|"error",…}` frames. Once the first byte is out the status is
  already 200, so a failure can only arrive as an `error` frame — `HostedClient` maps those codes
  to the same `LLMError` kinds the UI already renders. `x-accel-buffering: no` is load-bearing:
  without it a proxy can hold the deltas to the end and quietly undo the whole route.
- **`LLMError` gained a `quota` kind** for "out of credits" / "monthly ceiling reached". It is
  treated as *transient* telemetry (`logEvent`), not an error report — being out of credits is an
  operating condition, same reasoning as `rate_limit`.
- The ledger stores counts only — model, input/output tokens, credits. **Never** put prompt or
  completion text in `app_credit_events`; `credits.test.ts` asserts the argument list.
- Not built yet (§6.2): publishing/marketplace, earning credits, payments. `app_credit_events`
  already has an `adjustment` reason and the grant is a floor, so both slot in without a migration.

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

## Desktop shell: "Nectar" (Workstream 4)

Above `lg` the app renders a desktop-native shell (top nav + persistent Buzz coach rail + bento
content); below it the original mobile column is unchanged. The design handoff is
`docs/design/desktop-redesign/` — recreate from it, never ship its HTML.

- **Two shells, one data layer.** `AppLayout` picks `NectarShell` or `MobileShell` via
  `useIsDesktop()`; each route element is a `<Responsive desktop={…} mobile={…} />` pair. Desktop
  screens live in `src/features/<feature>/desktop/`. **Duplication stops at the shell** — both
  branches read the same repositories, so switching viewport never changes the data. If you add a
  screen, add the route to *both* sides.
- **`DESKTOP_QUERY` (`src/hooks/useMediaQuery.ts`) has a copy in CSS** — the `@media (min-width:
  1024px)` guard around `html.dark body` in `index.css`. They must move together, or dark mode
  paints the page behind a still-light mobile shell.
- **Tokens, not hexes.** Nectar colours are plain custom properties on `:root`, redefined under
  `html.dark`, exposed to Tailwind via `@theme inline` (`--color-ink: var(--ink)`) so a class swap
  flips the palette with no CSS regeneration. **Any colour that must flip has to go through a token**
  — a raw hex in a utility won't. Names dodge the legacy scale: `honeyd`/`honeydd`, not
  `honey-d`/`honey-dd`. The old `honey-50…900` palette stays for the mobile shell.
- **Theme is localStorage, not Dexie** (`src/lib/theme/theme.ts`, key `bee-healthy:theme`): it must
  be readable synchronously before first paint, and it's per-device. The inline boot script in
  `index.html` reads the same key — change one, change both.
- **`.legacy-surface`** wraps the mobile-styled `DietPlanner` / `RecipeGenerator` where desktop
  screens embed them, remapping the `honey-*` palette onto dark tokens. Every legacy utility resolves
  through a custom property (`bg-white` → `var(--color-white)`), which is what makes it work. Delete
  it with the mobile palette in Workstream 5.
- **Charts are hand-rolled SVG, deliberately.** `lib/workout/chartGeometry.ts` holds the scaling
  (pure + tested); the desktop screens draw straight `<svg>`. This keeps recharts — still used by the
  *mobile* insights view — out of the desktop path. The charts stretch their viewBox
  (`preserveAspectRatio="none"`), so **data points are zero-length round-capped strokes with
  `vector-effect="non-scaling-stroke"`, not `<circle>`**, which would render as ellipses.
- **Derive, don't fake.** Prototype numbers (3/5 workouts, 178g protein, 🔥12) are placeholders. Real
  equivalents come from `lib/diet/activePlan.ts`, `lib/workout/blockStats.ts`, `lib/metrics/streak.ts`
  and `app/nectar/useCoachStats.ts`; anything the data can't support returns `null` and the UI drops
  that row rather than guessing. **There is no food log** — Home shows *planned* macros against the
  profile's target and says so; don't relabel it "logged".
- Buzz's per-screen tip copy is verbatim from the prototype (`app/nectar/tabs.ts`) and static;
  "Ask Buzz" is the one live LLM surface, streaming through the ordinary `LLMClient`.

## Security rules (non-negotiable)

- The user's **LLM API key lives only in Dexie `settings`** on-device. **Never** sync it to Supabase,
  log it, or write it to `docs/` or any committed file. The *owner's* key (`ANTHROPIC_API_KEY`) is
  the mirror image: server-only, never sent to the browser, and reachable solely through
  `api/_lib/anthropic.ts` behind the credit gate.
- **Server secrets never get a `VITE_` prefix.** `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`,
  `RESEND_API_KEY` and `ANTHROPIC_API_KEY` are server-only; a `VITE_` var is inlined into the
  browser bundle, and the service-role key there is a full database compromise. After touching env plumbing, re-run the
  bundle check: `npm run build && grep -rE "GoTrueClient|supabase-js" dist/assets/` must come back
  empty.
- Every Supabase table keeps **Row-Level Security enabled with no policies**. The service role
  bypasses it, so RLS is the backstop, not the guard — the guard is `userScope` (see above).
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
