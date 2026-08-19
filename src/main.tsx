import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { installGlobalErrorHandlers } from '@/lib/telemetry/reportError';
import './styles/index.css';

// Catch what escapes React: uncaught errors and unhandled promise rejections.
installGlobalErrorHandlers();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);
