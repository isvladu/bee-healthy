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
