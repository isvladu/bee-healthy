import { useState } from 'react';
import { Card } from '@/components/Card';
import { Field } from '@/components/form';
import { useAuth } from '@/hooks/useAuth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { runSync } from '@/lib/sync/engine';

const inputClass =
  'w-full rounded-xl border border-honey-200 bg-white px-3 py-2 text-honey-900 outline-none transition focus:border-honey-400 focus:ring-2 focus:ring-honey-200';

export function AccountSyncCard() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!isSupabaseConfigured()) {
    return (
      <Card className="space-y-2">
        <h3 className="font-semibold text-honey-800">Cloud sync</h3>
        <p className="text-sm text-honey-900/70">
          Not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> and run the SQL in{' '}
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
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(userId: string) {
    const { pushed, pulled } = await runSync(userId);
    setMessage(`Synced — ${pushed} sent, ${pulled} received.`);
  }

  function handleSignIn() {
    void withBusy(async () => {
      const supabase = getSupabase()!;
      const { data, error: e } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (e) throw e;
      if (data.user) await syncNow(data.user.id);
    });
  }

  function handleSignUp() {
    void withBusy(async () => {
      const supabase = getSupabase()!;
      const { data, error: e } = await supabase.auth.signUp({ email, password });
      if (e) throw e;
      if (data.session?.user) await syncNow(data.session.user.id);
      else setMessage('Check your email to confirm your account, then sign in.');
    });
  }

  function handleSignOut() {
    void withBusy(async () => {
      await getSupabase()!.auth.signOut();
      setMessage('Signed out.');
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
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void withBusy(() => syncNow(user.id))}
              disabled={busy}
              className="rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={busy}
              className="rounded-xl border border-honey-300 px-4 py-2 font-semibold text-honey-700 transition hover:bg-honey-100 disabled:opacity-60"
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
          <Field label="Password">
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
              className="rounded-xl bg-honey-500 px-4 py-2 font-semibold text-white transition hover:bg-honey-600 active:scale-[0.98] disabled:opacity-60"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={handleSignUp}
              disabled={busy || !email || !password}
              className="rounded-xl border border-honey-300 px-4 py-2 font-semibold text-honey-700 transition hover:bg-honey-100 disabled:opacity-60"
            >
              Sign up
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
