import toast from 'react-hot-toast';
import { i18n } from '@/i18n';

/**
 * Toast shown when a NON-sponsor clicks a sponsor-gated control. The gated
 * control stays enabled and clickable (never greyed out) — clicking it shows
 * this toast instead of running the action.
 *
 * Intentionally generic: it names no specific feature and avoids "전용"
 * ("exclusive") wording so it reads as an invitation, not a paywall. The
 * "Learn more" link opens the Sponsor settings tab in a NEW tab.
 */
export function showSponsorGatedToast(): void {
  toast((t) => (
    <span className="flex items-center gap-3">
      <span>{i18n.t('common:sponsorGated.message')}</span>
      <button
        type="button"
        onClick={() => {
          // Carry over the current query (workingDir etc.); without it the new
          // tab has no working directory and bounces to the project picker.
          window.open(
            `${window.location.origin}/settings/sponsor${window.location.search}`,
            '_blank',
            'noopener',
          );
          toast.dismiss(t.id);
        }}
        className="whitespace-nowrap font-medium text-accent-claude transition-opacity hover:opacity-80"
      >
        {i18n.t('common:sponsorGated.learnMore')}
      </button>
    </span>
  ));
}
