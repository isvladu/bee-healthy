import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Field } from '@/components/form';
import { postJson } from '@/lib/backend/client';
import { MIN_PASSWORD_LENGTH } from '@/lib/backend/limits';
import { backendMessage } from '@/lib/backend/messages';

const inputClass =
  'w-full rounded-xl border border-honey-200 bg-white px-3 py-2 text-honey-900 outline-none transition focus:border-honey-400 focus:ring-2 focus:ring-honey-200';

/** Landing page for the `/reset?token=…` link in the password-reset email. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const mismatch = confirmation.length > 0 && password !== confirmation;
  const ready =
    !busy &&
    token !== '' &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirmation;

  function submit() {
    setBusy(true);
    setError('');
    void postJson('/api/auth/reset', { token, password })
      .then(() => setDone(true))
      .catch((err: unknown) => setError(backendMessage(err)))
      .finally(() => setBusy(false));
  }

  return (
    <div className="p-4">
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-honey-800">
          Choose a new password
        </h2>

        {done ? (
          <>
            <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700" role="status">
              Your password is updated, and every other device has been signed
              out. Sign in again with your new password.
            </p>
            <Link
              to="/settings"
              className="inline-block text-sm font-medium text-honey-700 underline underline-offset-2"
            >
              Go to settings
            </Link>
          </>
        ) : (
          <>
            {!token && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
                That link is missing its reset code. Request a new one from
                settings.
              </p>
            )}

            <Field
              label="New password"
              hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            >
              <input
                type="password"
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                value={confirmation}
                autoComplete="new-password"
                onChange={(e) => setConfirmation(e.target.value)}
                className={inputClass}
              />
            </Field>

            {mismatch && (
              <p className="text-sm text-red-700">Those passwords don’t match.</p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!ready}
              className="rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Set new password'}
            </button>

            {error && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
