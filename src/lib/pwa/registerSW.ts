/**
 * Service-worker registration, wired for telemetry.
 *
 * `vite-plugin-pwa` can inject its own registration script, but then the
 * lifecycle callbacks are unreachable. Importing the virtual module here makes
 * `injectRegister: 'auto'` step aside (it only injects when nothing imports it),
 * so no `vite.config.ts` change is needed.
 *
 * `registerType` is `autoUpdate`, so `onNeedRefresh` never fires — a waiting
 * worker activates itself. `updatefound` is what tells us a new build is
 * downloading, and `controllerchange` that it took over.
 */
import { registerSW } from 'virtual:pwa-register';
import { logEvent } from '@/lib/telemetry/logEvent';

let installed = false;

/** Register the service worker and report its lifecycle. Idempotent. */
export function installServiceWorker(): void {
  if (installed) return;
  installed = true;

  const startedAt = Date.now();

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      logEvent('info', 'pwa.sw_registered', {
        durationMs: Date.now() - startedAt,
        // The URL is our own build asset, not user data.
        scriptUrl: swUrl,
      });
      registration?.addEventListener('updatefound', () => {
        logEvent('info', 'pwa.update_found');
      });
    },
    onOfflineReady() {
      logEvent('info', 'pwa.offline_ready');
    },
    onRegisterError(error) {
      logEvent('warn', 'pwa.register_failed', {
        reason: error instanceof Error ? error.message : typeof error,
      });
    },
  });

  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // A new build just took over — the page is now running mixed versions
      // until it reloads, which is where stale-chunk errors come from.
      logEvent('info', 'pwa.update_activated');
    });
  }
}
