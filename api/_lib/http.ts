/**
 * Shared request plumbing for the `/api` tier: method + content-type guards,
 * the same-origin (CSRF) check, body size caps, and JSON replies.
 *
 * The origin check is the second half of our CSRF defense. The session cookie
 * is `SameSite=Lax`, which already blocks cross-site subresource requests from
 * carrying it; requiring a matching `Origin` on every state-changing POST
 * closes the remainder. It is best-effort — headers can be forged outside a
 * browser — but a forged header can't bring a victim's cookie with it, which is
 * the attack this guards.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Auth and sync payloads are small; this bounds abuse and cost. */
export const MAX_BODY_BYTES = 256 * 1024;

/**
 * Origins allowed to call this deployment: its own host, Vercel's generated
 * URLs, and any configured custom domain.
 *
 * `APP_ALLOWED_ORIGINS` is the project-wide setting. `extra` lets a single
 * endpoint widen that (the telemetry logger passes its older, narrower
 * `ERROR_LOG_ALLOWED_ORIGINS` for backwards compatibility).
 */
export function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
  extra?: string,
): boolean {
  if (!origin) return false;
  const allowed = new Set<string>();
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`); // localhost under `vercel dev`
  }
  for (const url of [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]) {
    if (url) allowed.add(`https://${url}`);
  }
  for (const csv of [process.env.APP_ALLOWED_ORIGINS, extra]) {
    for (const candidate of (csv ?? '').split(',')) {
      const trimmed = candidate.trim();
      if (trimmed) allowed.add(trimmed);
    }
  }
  return allowed.has(origin);
}

export function sendJson(
  res: VercelResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.setHeader('cache-control', 'no-store');
  res.status(status).json(body);
}

/**
 * Error replies carry a stable machine-readable `error` code and nothing else.
 * No stack, no database message, no hint about whether an account exists.
 */
export function sendError(
  res: VercelResponse,
  status: number,
  code: string,
): void {
  sendJson(res, status, { error: code });
}

/**
 * Guard a state-changing endpoint: POST + JSON + same-origin + size cap.
 * Returns false when it has already answered the request.
 */
export function guardPost(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    sendError(res, 405, 'method_not_allowed');
    return false;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    sendError(res, 415, 'unsupported_media_type');
    return false;
  }
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    sendError(res, 413, 'payload_too_large');
    return false;
  }
  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
    sendError(res, 403, 'forbidden_origin');
    return false;
  }
  return true;
}

/** Guard a read-only endpoint: GET only. */
export function guardGet(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    sendError(res, 405, 'method_not_allowed');
    return false;
  }
  return true;
}

/** True when the request arrived over a connection we can set `Secure` on. */
export function isSecureRequest(req: VercelRequest): boolean {
  const host = String(req.headers.host ?? '');
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  return !local;
}

/**
 * Best-effort client IP for rate limiting. Spoofable in general, but on Vercel
 * `x-forwarded-for`'s first entry is set by the platform edge.
 */
export function clientIp(req: VercelRequest): string {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '');
  const first = forwarded.split(',')[0]?.trim();
  return first || String(req.headers['x-real-ip'] ?? '') || 'unknown';
}

/**
 * Wrap a handler so an unexpected throw becomes a 500 with no detail leaked.
 * `backend_unconfigured` is mapped to 503 so the client can tell "no cloud
 * configured" (stay local-only) apart from "the cloud is broken".
 */
export function withErrorHandling(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof Error && err.message === 'backend_unconfigured') {
        sendError(res, 503, 'backend_unconfigured');
        return;
      }
      if (err instanceof Error && err.message === 'hosted_ai_unconfigured') {
        sendError(res, 503, 'hosted_ai_unconfigured');
        return;
      }
      // Server-side only: this lands in Vercel Runtime Logs, never in the
      // response body.
      console.error(
        JSON.stringify({
          level: 'error',
          source: 'api',
          message: err instanceof Error ? err.message : 'unknown error',
          where: 'api',
          route: req.url?.slice(0, 200),
        }),
      );
      sendError(res, 500, 'internal_error');
    }
  };
}
