// The browser's only channel to the server tier.
//
// This replaces `lib/supabase/client.ts`. The app no longer holds a database
// credential of any kind: it calls same-origin `/api/*` routes and the session
// travels in an httpOnly cookie the JavaScript here cannot read.
//
// Whether a backend exists is *discovered*, not configured — there is no
// `VITE_BACKEND_URL` to drift out of step with the server. `/api/auth/me`
// answers 401 (signed out), 200 (signed in), or 503 `backend_unconfigured`,
// and under `vite dev` there is no `/api` tier at all, so the SPA fallback
// hands back HTML. All three "no backend" cases collapse to the same result:
// the app stays fully local-only, exactly as it did with Supabase unset.

export class BackendError extends Error {
  constructor(
    /** Stable machine-readable code from the server, e.g. `invalid_credentials`. */
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'BackendError';
  }
}

/** True when the server answered with JSON rather than the SPA fallback. */
function isJson(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes(
    'application/json',
  );
}

export interface ApiResult<T> {
  status: number;
  body: T;
}

/**
 * Fetch a JSON API route. Throws `BackendError` for any non-2xx response, so
 * callers can branch on `err.code`. Cookies ride along on same-origin requests.
 */
export async function apiFetch<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { status, body } = await apiCall<T>(path, init);
  if (status >= 200 && status < 300) return body;
  const code =
    (body as { error?: string } | null)?.error ?? `http_${status}`;
  throw new BackendError(code, status);
}

/** Like `apiFetch`, but hands back non-2xx responses instead of throwing. */
export async function apiCall<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      // Same-origin on Vercel, so this is all the cookie needs.
      credentials: 'same-origin',
    });
  } catch {
    // Offline, DNS failure, connection reset — an operating condition for a
    // local-first app, not a defect.
    throw new BackendError('network_unavailable', 0);
  }

  if (!isJson(response)) {
    // `vite dev`'s SPA fallback, or a host with no `/api` tier: HTML where JSON
    // was expected means there is nothing to talk to.
    throw new BackendError('backend_unavailable', response.status);
  }

  return { status: response.status, body: (await response.json()) as T };
}

export function postJson<T = Record<string, unknown>>(
  path: string,
  body: unknown,
): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

/** A backend is present but has no database configured behind it. */
export function isUnconfigured(err: unknown): boolean {
  return (
    err instanceof BackendError &&
    (err.code === 'backend_unconfigured' ||
      err.code === 'backend_unavailable')
  );
}
