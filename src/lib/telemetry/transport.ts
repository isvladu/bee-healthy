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
    // Deployed to a plain static host with no `/api` tier — stop trying.
    if (res.status === 404 || res.status === 405) disabled = true;
  } catch {
    // Offline, blocked by an extension, CSP — drop it silently.
  }
}

/** Test-only: clear the self-disable flag. */
export function resetTransportForTests(): void {
  disabled = false;
}
