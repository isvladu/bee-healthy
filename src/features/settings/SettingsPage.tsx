import { lazy, Suspense } from 'react';
import { Card } from '@/components/Card';
import { useSettings } from '@/hooks/useSettings';
import { AiSettingsForm } from './AiSettingsForm';
import { ProfileForm } from './ProfileForm';

// Lazy so the account/sync UI stays out of the initial bundle. (It no longer
// pulls in `@supabase/supabase-js` — that moved server-side with Workstream 2 —
// but this card is still off the critical path for a local-first launch.)
const AccountSyncCard = lazy(() =>
  import('./AccountSyncCard').then((m) => ({ default: m.AccountSyncCard })),
);

export function SettingsPage() {
  const settings = useSettings();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-honey-800">Settings</h2>
        <p className="mt-1 text-sm text-honey-900/60">
          Your details stay on this device. Sign in below to sync them across
          your devices — your AI key always stays here.
        </p>
      </div>

      {settings ? (
        <>
          <ProfileForm settings={settings} />
          <AiSettingsForm settings={settings} />
        </>
      ) : (
        <Card>
          <p className="text-sm text-honey-900/60">Loading…</p>
        </Card>
      )}

      <Suspense
        fallback={
          <Card>
            <p className="text-sm text-honey-900/60">Loading…</p>
          </Card>
        }
      >
        <AccountSyncCard />
      </Suspense>
    </section>
  );
}
