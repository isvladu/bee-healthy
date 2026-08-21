/**
 * Server-only configuration.
 *
 * Everything here is read from the Vercel *server* environment. None of these
 * names carry a `VITE_` prefix, and none of them may ever gain one: a `VITE_`
 * variable is inlined into the browser bundle, and `SUPABASE_SERVICE_ROLE_KEY`
 * in the bundle is a full database compromise (it bypasses RLS).
 *
 * Read at call time rather than module load so tests can set the environment
 * per case, and so a missing variable surfaces as a handled 503 instead of an
 * import-time crash.
 */

export interface BackendEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** Extra entropy mixed into email/session token hashing. */
  sessionSecret: string;
}

/**
 * The backend is optional, exactly like Supabase sync was: with no
 * configuration the app stays fully local-only rather than erroring.
 */
export function isBackendConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SESSION_SECRET,
  );
}

/** Throws when unconfigured — callers turn that into a 503. */
export function backendEnv(): BackendEnv {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!supabaseUrl || !serviceRoleKey || !sessionSecret) {
    throw new Error('backend_unconfigured');
  }
  return { supabaseUrl, serviceRoleKey, sessionSecret };
}

/**
 * Hosted AI (Workstream 3): the *owner's* Anthropic key, used to serve users
 * who have not brought their own. It is the one secret here that costs money
 * directly rather than merely guarding data, which is why the proxy checks a
 * per-user credit balance and a global monthly ceiling before every call.
 *
 * Unset means hosted AI is simply off — the app still works with a user's own
 * key, exactly as it did before this workstream.
 */
export function isHostedAiConfigured(): boolean {
  return isBackendConfigured() && Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Throws when hosted AI is unconfigured — callers turn that into a 503. */
export function anthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('hosted_ai_unconfigured');
  return key;
}

/**
 * Free credits every account is topped up to at the start of a calendar month.
 * 300 credits = $3 of list-price model spend.
 */
export function freeMonthlyCredits(): number {
  return positiveInt(process.env.AI_FREE_MONTHLY_CREDITS, 300);
}

/**
 * Hard ceiling on the owner's Anthropic spend per calendar month, in US
 * dollars (§6.1). Past it, hosted AI stops for everyone until the month rolls
 * over; bring-your-own-key users are unaffected.
 */
export function aiMonthlyBudgetMicros(): number {
  return positiveInt(process.env.AI_MONTHLY_BUDGET_USD, 25) * 1_000_000;
}

/**
 * A malformed number here would silently disable a spend control, so an
 * unparseable value falls back to the (safe, non-zero) default rather than to
 * zero or Infinity.
 */
function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Calendar month key ('YYYY-MM') that grants and spend totals are bucketed by. */
export function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Public origin of the app, used to build links in outgoing email.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` names the production domain and is set on
 * *every* deployment, previews included — so preferring it unconditionally
 * would email production links from a staging deploy. Since both environments
 * share one database the token would silently work there, which is a confusing
 * way to lose an afternoon. Preview deployments therefore use their own
 * per-deployment `VERCEL_URL`, and `APP_URL` overrides everything.
 */
export function appUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel =
    process.env.VERCEL_ENV === 'production'
      ? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
      : (process.env.VERCEL_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL);

  return vercel ? `https://${vercel}` : 'http://localhost:3000';
}
