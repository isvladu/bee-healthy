import { Card } from '@/components/Card';
import { useSettings } from '@/hooks/useSettings';
import { AiSettingsForm } from './AiSettingsForm';
import { ProfileForm } from './ProfileForm';

export function SettingsPage() {
  const settings = useSettings();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-honey-800">Settings</h2>
        <p className="mt-1 text-sm text-honey-900/60">
          Your details stay on this device. Cloud sync is added in a later phase.
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
    </section>
  );
}
