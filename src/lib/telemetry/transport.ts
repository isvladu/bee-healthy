/**
 * The shared pipe to `/api/log`.
 *
 * Both telemetry channels post through here, so the "is telemetry on?" gate and
 * the self-disable live in one place: if the app is deployed somewhere with no
 * `/api` tier, a single 404 silences errors *and* events.
 *
 * Nothing here throws. Telemetry failing must be invisible to the user.
 */

const ENDPOINT = '/api/log';

/** Keep a serialized body comfortably under the server's 10 KB cap. */
export const MAX_BODY_BYTES = 9000;

/**
 * Statuses that mean the endpoint will reject every future post identically, so
 * continuing would burn the whole per-page budget on requests that cannot land:
 *  - 404/405 — deployed to a static host with no `/api` tier.
 *  - 401 — an auth gate sits in front of `/api` (e.g. Vercel Deployment
 *    Protection on a preview), which answers before the function ever runs.
 *
 * 403 is deliberately absent. That is *our own* origin check, and treating it
 * as terminal would both silence telemetry over a single odd request and hide a
 * misconfigured `ERROR_LOG_ALLOWED_ORIGINS` behind silence rather than logs.
 */
const DEAD_ENDPOINT_STATUSES = new Set([401, 404, 405]);

let disabled = false;

/**
 * The per-channel caps live with their channels; this is the global gate only.
 */
export function transportEnabled(): boolean {
  if (disabled) return false;
  if (typeof fetch !== 'function') return false;
  const flag = import.meta.env.VITE_ERROR_REPORTING as string | undefined;
  if (flag === 'off') return false;
  // `vite dev` serves no `/api` tier, so posting would only log 404s. Set
  // VITE_ERROR_REPORTING=on to exercise the endpoint under `vercel dev`.
  if (import.meta.env.DEV && flag !== 'on') return false;
  return true;
}

export function byteLength(text: string): number {
  return typeof TextEncoder === 'undefined'
    ? text.length
    : new TextEncoder().encode(text).length;
}

/** Fire-and-forget POST. Resolves regardless of outcome. */
export async function postTelemetry(body: string): Promise<void> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      // Survive the page unload that often follows a fatal error.
      keepalive: true,
    });
    if (DEAD_ENDPOINT_STATUSES.has(res.status)) disabled = true;
  } catch {
    // Offline, blocked by an extension, CSP — drop it silently.
  }
}

/** Test-only: clear the self-disable flag. */
export function resetTransportForTests(): void {
  disabled = false;
}
