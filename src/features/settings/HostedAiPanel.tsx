import { useHostedAi } from '@/hooks/useHostedAi';
import type { HostedAiReason } from '@/lib/backend/hostedAi';

/**
 * The built-in AI's status line: what it is, whether this account can use it,
 * and how much of the month's allowance is left.
 *
 * Credits are shown as a count rather than as money. They *are* money (one
 * credit is one cent of model spend), but a user thinking about "how many more
 * plans can I generate" is not helped by a currency figure, and quoting one
 * would imply a bill they never get.
 */

const REASONS: Record<HostedAiReason, string> = {
  unconfigured: 'Built-in AI isn’t enabled on this deployment.',
  unauthenticated:
    'Sign in under Cloud sync below to use the built-in AI without your own key.',
  email_unverified:
    'Confirm your email address to unlock the built-in AI — check your inbox, or resend the link from the Cloud sync card below.',
  budget_exhausted:
    'Built-in AI is paused for the rest of this month. Add your own API key below to keep generating.',
  insufficient_credits:
    'You’ve used this month’s AI credits. They refresh on the 1st — or add your own API key below for unlimited use.',
};

export function HostedAiPanel({ hasOwnKey }: { hasOwnKey: boolean }) {
  const hosted = useHostedAi();

  // Nothing to say: no server tier, or a deployment without hosted AI at all.
  if (hosted.loading || hosted.reason === 'unconfigured') return null;

  const { available, balance, monthlyGrant } = hosted;
  const used =
    typeof balance === 'number' && typeof monthlyGrant === 'number'
      ? Math.max(0, monthlyGrant - balance)
      : undefined;

  return (
    <div className="rounded-xl bg-honey-50 p-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-honey-800">
        <span aria-hidden>✨</span>
        Built-in AI
        {available && (
          <span className="ml-auto font-mono text-xs text-honey-700">
            {balance} credits left
          </span>
        )}
      </div>

      {available ? (
        <>
          <p className="mt-1 text-honey-900/70">
            {hasOwnKey
              ? 'Available, but your own API key takes priority — remove it to use the included credits.'
              : 'Generating plans and recipes uses your monthly credits. No API key needed.'}
          </p>
          {typeof monthlyGrant === 'number' && (
            <div className="mt-2">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-honey-200"
                role="img"
                aria-label={`${balance} of ${monthlyGrant} monthly credits remaining`}
              >
                <div
                  className="h-full rounded-full bg-honey-500 transition-all"
                  style={{
                    width: `${Math.round(((balance ?? 0) / monthlyGrant) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-honey-900/50">
                {used ?? 0} of {monthlyGrant} used this month · refreshes on the 1st
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="mt-1 text-honey-900/70">
          {hosted.reason ? REASONS[hosted.reason] : 'Not available right now.'}
        </p>
      )}
    </div>
  );
}
