# Bee Healthy 🐝

An offline-first **PWA** for tracking diet and workouts, with an AI assistant for diet
planning, macros, interactive shopping lists, a recipe cookbook, workout import, and
improvement insights.

> Full architecture and phased build plan live in `docs/` (private — gitignored).
> Agent/dev conventions are in [`CLAUDE.md`](./CLAUDE.md).

## Stack

Vite · React · TypeScript · Tailwind CSS v4 · `vite-plugin-pwa` · Dexie (IndexedDB) ·
Supabase (sync, later phase) · `@anthropic-ai/sdk` (BYO key, later phase)

## Getting started

```bash
npm install
npm run gen:icons   # generate placeholder PWA icons into public/
npm run dev         # http://localhost:5173
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Serve the production build (test PWA/offline here) |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (watch) |
| `npm run test:run` | Vitest (single run) |
| `npm run gen:icons` | Regenerate placeholder PWA icons |

## Project status

- **Phase 0 — Scaffold:** ✅ installable PWA shell, navigation, placeholder screens.
- **Phase 1 — Local data layer:** ✅ Dexie schema + typed repositories, settings store,
  body-stats onboarding with a live calorie-target estimate (Mifflin–St Jeor).
- **Phase 2 — LLM plumbing:** ✅ `LLMClient` abstraction + `AnthropicClient` (browser-direct,
  BYO key, lazy-loaded), model catalog, friendly error mapping, and a Settings key entry with a
  live "Test connection" ping.
- **Phase 3 — Diet planning & macros:** ✅ structured multi-day plan generation (Claude →
  validated `DietPlan`), per-meal/day macros, a day-by-day plan view with streaming "coach tips",
  and persistence to IndexedDB. Two generation methods: **API key** (any length 3–60 days, with a
  rotating 14-day cycle for longer plans) or **your own Claude/ChatGPT subscription** (copy a
  tailored prompt → paste the JSON reply → import). Allergies and country of residence are
  collected and fed into both prompts.
- **Phase 4 — Shopping list & cookbook:** ✅ an interactive, category-grouped, checkable shopping
  list generated deterministically from any plan (works offline, no key); a cookbook with recipe
  generation via API key **or** subscription import (with per-serving macros).
- **Phase 5 — Workout import & tracking:** ✅ paste a workout in plain text → parsed
  deterministically (offline) into weeks/sessions/exercises, or "Parse with AI" for messier
  formats; MET-based calorie estimates, week-by-week view with per-session completion logging and
  volume/calorie summaries.
- **Phase 6 — Improvement insights:** ✅ week-over-week charts (volume + calories, estimated 1RM
  by exercise via Epley) and a weight-trend chart on the dashboard, plus streaming LLM coach
  insights. Charts (recharts) are lazy-loaded, keeping the initial bundle small.

All planned phases (0–6) are complete. See `docs/` (private) for the implementation plan.
