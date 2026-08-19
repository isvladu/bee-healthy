import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { logEvent } from '@/lib/telemetry/logEvent';
import { installGlobalErrorHandlers } from '@/lib/telemetry/reportError';
import { installServiceWorker } from '@/lib/pwa/registerSW';
import './styles/index.css';

// Catch what escapes React: uncaught errors and unhandled promise rejections.
installGlobalErrorHandlers();
installServiceWorker();

// The baseline every other event is read against: which build, launched how.
logEvent('info', 'app.start', {
  appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown',
  standalone: window.matchMedia('(display-mode: standalone)').matches,
  online: navigator.onLine,
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);
