# Bee Healthy 🐝

An **offline-first Progressive Web App** for tracking your diet and workouts, with an AI
assistant for planning and insights. It runs entirely in the browser, works fully offline,
and syncs across devices only if you choose to enable it.

You bring the intelligence in one of two ways: paste your own **Anthropic API key**, or use
your existing **Claude / ChatGPT subscription** via a copy‑paste flow — no key required.

## Features

**Diet**
- Generate multi‑day meal plans (3–60 days) with per‑meal and per‑day macros.
- Two ways to generate: directly with your Anthropic API key, or by copying a tailored
  prompt into your own Claude/ChatGPT app and pasting the reply back to import.
- Tell it your **allergies / foods to avoid** and your **country of residence**, and it
  keeps plans safe and locally shoppable.
- Day‑by‑day view with streaming AI "coach tips".

**Shopping list**
- Generated from any plan — ingredients aggregated by name and unit, grouped by aisle.
- Fully interactive (check items off, progress bar) and computed **deterministically**, so
  it works offline and needs no API key.

**Cookbook**
- Save recipes with per‑serving macros, generated via API key or imported from your
  subscription (same copy‑paste flow as diets).

**Workout**
- Paste a workout in plain text (e.g. `Bench press 3x8 @60kg`) — parsed **locally and
  instantly** into weeks, sessions, and exercises. An optional "Parse with AI" handles
  messier formats.
- MET‑based calorie estimates, week‑by‑week tracking with per‑session completion logging.
- Insights: weekly volume & calories, estimated 1RM per lift (Epley), a body‑weight trend,
  and streaming AI coaching.

**Everything is local‑first** — all data lives in IndexedDB on your device and the app works
with no network. Optional cloud sync (below) adds multi‑device support.

## Tech stack

| Area | Choice |
| --- | --- |
| Build / framework | Vite · React · TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| PWA | `vite-plugin-pwa` (installable, offline app shell) |
| Local data | Dexie / IndexedDB (source of truth) |
| AI | `@anthropic-ai/sdk` (Claude), BYO key, called from the browser |
| Validation | `zod` (all structured AI output is validated) |
| Cloud sync (optional) | Supabase (Postgres + Auth, Row‑Level Security) |
| Charts | Recharts (lazy‑loaded) |
| Tests | Vitest + Testing Library |

## Getting started

Requirements: **Node 20+** and npm.

```bash
npm install
npm run gen:icons   # generate the PWA icons into public/ (first run)
npm run dev         # http://localhost:5173
```

Open the app, go to **Settings**, and either paste an Anthropic API key or use the
**Claude / ChatGPT** tab on any generator to work from your subscription instead.

## Configuration

### AI access (per‑user, in the app)

Your LLM API key is entered in **Settings** and stored **only on your device** (IndexedDB).
It is never uploaded, logged, or synced. Calls go directly from your browser to the Anthropic
API. If you'd rather not use a key at all, use the copy‑paste subscription flow.

Default model is `claude-sonnet-4-6`; `claude-opus-4-8` and `claude-haiku-4-5` are selectable
in Settings.

### Cloud sync (optional)

The app is fully functional without this. To sync across devices:

1. Create a [Supabase](https://supabase.com) project and run
   [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql) in its SQL editor.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (both from **Supabase → Settings → API**; the URL is the bare project URL, e.g.
   `https://<ref>.supabase.co`).
3. Restart the dev server, then **Settings → Cloud sync** → sign up / sign in.

Sync is last‑write‑wins across all your records. Your API key is stripped before anything is
uploaded and never leaves the device.

> `VITE_*` variables are baked in at **build time**. When deploying, set them in your host's
> environment and redeploy for changes to take effect.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type‑check + production build to `dist/` |
| `npm run preview` | Serve the production build (best place to test PWA/offline) |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (watch) |
| `npm run test:run` | Vitest (single run) |
| `npm run gen:icons` | Regenerate the PWA icons |

## Project structure

```
api/              # Vercel serverless functions (error-report sink)
src/
  app/            # router + layout shell, error boundary
  components/     # shared UI primitives
  features/       # feature UIs: diet, shopping, cookbook, workout, insights, settings
  hooks/          # useSettings, useLLMClient, useAuth
  lib/
    db/           # Dexie schema + repositories (all data access)
    llm/          # LLMClient abstraction, Anthropic client, prompts, schemas
    diet/ recipe/ workout/ shopping/   # domain logic (parsing, macros, calories, insights)
    nutrition/    # calorie-target math (Mifflin–St Jeor)
    sync/ supabase/   # optional cloud sync
    telemetry/    # client error reporting → /api/log
supabase/migrations/   # SQL schema + RLS policies for sync
docs/             # design & expansion docs (private, gitignored)
```

Conventions and architecture notes for contributors (and AI agents) live in
[`CLAUDE.md`](./CLAUDE.md).

## Testing

```bash
npm run test:run   # unit + component tests
```

Domain logic (parsers, macro/calorie math, repositories, sync serialization) is covered by
unit tests; AI features are tested with a mocked `LLMClient`. For a real end‑to‑end check,
run `npm run dev` and enter a test key in Settings. For PWA/offline behavior, use
`npm run preview` and toggle DevTools → Network → Offline.

## Deployment

`npm run build` produces a static site in `dist/` — deploy it to any static host (Vercel,
Netlify, Cloudflare Pages). If you use cloud sync, set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in the host's environment and redeploy. HTTPS is required for the
PWA (all of the above provide it automatically).

**On Vercel**, the `api/` directory is deployed as serverless functions alongside the static
app — currently just `/api/log`, which receives client error reports and writes them to the
Runtime Logs. On a custom domain, set `ERROR_LOG_ALLOWED_ORIGINS` (server-side, comma-separated)
so the endpoint's same-origin check accepts it. On a plain static host the endpoint simply isn't
there and error reporting turns itself off after the first 404. Run `vercel dev` to exercise
`api/` locally — `vite dev` serves the static app only.

## Security & privacy

- Your **LLM API key never leaves your device** — stored in IndexedDB, excluded from sync,
  never logged. Direct browser‑to‑Anthropic calls are intentional for a personal BYO‑key app.
- Supabase uses **Row‑Level Security**: each account can only read and write its own rows.
- The Supabase **anon key is meant to be public** (safe in the client bundle); RLS is what
  protects data.
- Diet/workout content is never sent anywhere except your chosen AI provider.
