import { useState } from 'react';
import { Card } from '@/components/Card';
import { Field } from '@/components/form';
import { useAuth, type AuthUser } from '@/hooks/useAuth';
import { BackendError, postJson } from '@/lib/backend/client';
import { backendMessage } from '@/lib/backend/messages';
import { MIN_PASSWORD_LENGTH } from '@/lib/backend/limits';
import { isAuthExpired, runSync } from '@/lib/sync/engine';
import { reportError } from '@/lib/telemetry/reportError';

const inputClass =
  'w-full rounded-xl border border-honey-200 bg-white px-3 py-2 text-honey-900 outline-none transition focus:border-honey-400 focus:ring-2 focus:ring-honey-200';

const primaryButton =
  'rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98] disabled:opacity-60';
const secondaryButton =
  'rounded-xl border border-honey-300 px-4 py-2 font-semibold text-honey-700 transition hover:bg-honey-100 disabled:opacity-60';

export function AccountSyncCard() {
  const { user, loading, backendAvailable, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!backendAvailable) {
    return (
      <Card className="space-y-2">
        <h3 className="font-semibold text-honey-800">Cloud sync</h3>
        <p className="text-sm text-honey-900/70">
          Not configured. Deploy the <code>api/</code> functions with{' '}
          <code>SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> and{' '}
          <code>SESSION_SECRET</code> set on the server, and run the SQL in{' '}
          <code>supabase/migrations/</code> to enable multi-device sync. The app
          works fully offline without it.
        </p>
      </Card>
    );
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (err) {
      setError(backendMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(userId: string) {
    try {
      const { pushed, pulled } = await runSync(userId);
      setMessage(`Synced — ${pushed} sent, ${pulled} received.`);
    } catch (err) {
      // The session died between hydration and this request. Re-read it so the
      // card drops back to the signed-out form instead of looping on failures.
      if (isAuthExpired(err)) await refresh();
      throw err;
    }
  }

  /**
   * Report an auth failure, then rethrow so `withBusy` still shows the friendly
   * message. Sync failures are reported by the engine, not here.
   *
   * Only unexpected failures are worth an error report: a wrong password or a
   * rate-limited caller is the endpoint working as designed, and reporting it
   * would burn the page's error budget on normal user behaviour.
   */
  function raiseAuth(err: unknown, action: string): never {
    const expected =
      err instanceof BackendError &&
      [
        'invalid_credentials',
        'account_locked',
        'rate_limited',
        'email_taken',
        'invalid_input',
        'network_unavailable',
      ].includes(err.code);
    if (!expected) reportError(err, { where: 'auth', extra: { action } });
    throw err;
  }

  function handleSignIn() {
    void withBusy(async () => {
      const { user: signedIn } = await postJson<{ user: AuthUser }>(
        '/api/auth/login',
        { email, password },
      ).catch((err: unknown) => raiseAuth(err, 'signIn'));

      setPassword('');
      await refresh();
      await syncNow(signedIn.id);
    });
  }

  function handleSignUp() {
    void withBusy(async () => {
      const { user: created } = await postJson<{ user: AuthUser }>(
        '/api/auth/signup',
        { email, password },
      ).catch((err: unknown) => raiseAuth(err, 'signUp'));

      setPassword('');
      await refresh();
      await syncNow(created.id);
    });
  }

  function handleSignOut() {
    void withBusy(async () => {
      await postJson('/api/auth/logout', {}).catch((err: unknown) =>
        raiseAuth(err, 'signOut'),
      );
      await refresh();
      setMessage('Signed out.');
    });
  }

  function handleForgotPassword() {
    void withBusy(async () => {
      await postJson('/api/auth/request-reset', { email }).catch(
        (err: unknown) => raiseAuth(err, 'requestReset'),
      );
      // The server answers identically whether or not the account exists, so
      // this wording must not imply that it does.
      setMessage(
        'If an account exists for that email, a reset link is on its way.',
      );
    });
  }

  function handleResendVerification() {
    void withBusy(async () => {
      const body = await postJson<{
        alreadyVerified: boolean;
        email?: 'sent' | 'skipped' | 'failed';
      }>('/api/auth/resend-verification', {}).catch((err: unknown) =>
        raiseAuth(err, 'resendVerification'),
      );

      if (body.alreadyVerified) {
        // The banner was stale — re-read the session so it disappears.
        await refresh();
        setMessage('Your email is already confirmed.');
        return;
      }
      // Don't claim an email is on its way when the server told us it never
      // sent one; that turns a config problem into a support mystery.
      setMessage(
        body.email === 'sent'
          ? 'Confirmation email sent — check your inbox.'
          : 'Email isn’t configured on the server, so no message was sent.',
      );
    });
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <span aria-hidden>☁️</span>
        <h3 className="font-semibold text-honey-800">Cloud sync</h3>
      </div>

      {loading ? (
        <p className="text-sm text-honey-900/60">Checking session…</p>
      ) : user ? (
        <div className="space-y-3">
          <p className="text-sm text-honey-900/70">
            Signed in as <strong>{user.email}</strong>
          </p>
          {!user.emailVerified && (
            <div className="space-y-2 rounded-xl bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                Your email isn’t confirmed yet — check your inbox for the
                confirmation link.
              </p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={busy}
                className="text-sm font-medium text-amber-900 underline underline-offset-2 disabled:opacity-60"
              >
                Send it again
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void withBusy(() => syncNow(user.id))}
              disabled={busy}
              className={primaryButton}
            >
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={busy}
              className={secondaryButton}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-honey-900/70">
            Sign in to sync your data across devices. Your AI key stays on this
            device and is never uploaded.
          </p>
          <Field label="Email">
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          >
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={busy || !email || !password}
              className={primaryButton}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={handleSignUp}
              disabled={busy || !email || password.length < MIN_PASSWORD_LENGTH}
              className={secondaryButton}
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={busy || !email}
              className="text-sm font-medium text-honey-700 underline underline-offset-2 disabled:opacity-60"
            >
              Forgot password?
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
