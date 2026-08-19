import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '@/lib/telemetry/reportError';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a broken screen shows a recovery card instead
 * of a white page, and reports them to `/api/log`.
 *
 * Wraps the router in `main.tsx`. React error boundaries must be class
 * components — there is no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      where: 'react',
      extra: { componentStack: info.componentStack ?? '' },
    });
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="text-4xl" aria-hidden>
          🐝
        </span>
        <h1 className="text-lg font-bold text-honey-800">Something went wrong</h1>
        <p className="text-sm text-honey-900/70">
          The app hit an unexpected error. Your data is saved on this device —
          reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98]"
        >
          Reload
        </button>
        <p className="text-xs text-honey-900/50">{error.message}</p>
      </div>
    );
  }
}
