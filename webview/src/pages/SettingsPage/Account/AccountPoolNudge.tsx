import {
  AccountPoolNudgeCard,
  useAccountPoolNudgeRelevant,
} from '@/components/Announcements/inline/accountPoolNudge';

/**
 * The account-pool nudge, on the screen the pools actually live on.
 *
 * Same announcement the empty chat can show, same card and same dismissal — so
 * closing it in either place closes it in both. Nobody should have to turn down
 * the same suggestion twice.
 */
export function AccountPoolNudge() {
  const relevant = useAccountPoolNudgeRelevant();
  if (!relevant) return null;

  return (
    <div className="mb-6">
      <AccountPoolNudgeCard actionable />
    </div>
  );
}
