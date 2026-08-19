import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/Card';
import { postJson } from '@/lib/backend/client';
import { backendMessage } from '@/lib/backend/messages';

type Status = 'working' | 'done' | 'failed';

/** Landing page for the `/verify?token=…` link in the confirmation email. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>('working');
  const [error, setError] = useState('');
  // The token is single-use, so React 19's development double-invoke of
  // effects would burn it on the first render and report failure on the second.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setStatus('failed');
      setError('That link is missing its confirmation code.');
      return;
    }

    void postJson('/api/auth/verify', { token })
      .then(() => setStatus('done'))
      .catch((err: unknown) => {
        setStatus('failed');
        setError(backendMessage(err));
      });
  }, [token]);

  return (
    <div className="p-4">
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-honey-800">
          Confirm your email
        </h2>

        {status === 'working' && (
          <p className="text-sm text-honey-900/70">Confirming…</p>
        )}

        {status === 'done' && (
          <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700" role="status">
            Your email is confirmed. Thanks!
          </p>
        )}

        {status === 'failed' && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <Link
          to="/settings"
          className="inline-block text-sm font-medium text-honey-700 underline underline-offset-2"
        >
          Back to settings
        </Link>
      </Card>
    </div>
  );
}
