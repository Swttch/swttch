import toast from 'react-hot-toast';
import { i18n } from '@/i18n';
import { Route } from '@/router';
import { openSettingsAt } from './openSettingsAt';

/**
 * Toast shown when a NON-sponsor clicks a sponsor-gated control. The gated
 * control stays enabled and clickable (never greyed out) — clicking it shows
 * this toast instead of running the action.
 *
 * Intentionally generic: it names no specific feature and avoids "전용"
 * ("exclusive") wording so it reads as an invitation, not a paywall. The
 * "Learn more" link opens the Sponsor settings page the way the user prefers
 * settings to open (overlay or dedicated tab) — see {@link openSettingsAt}.
 */
export function showSponsorGatedToast(): void {
  toast((t) => (
    <span className="flex items-center gap-3">
      <span>{i18n.t('common:sponsorGated.message')}</span>
      <button
        type="button"
        onClick={() => {
          void openSettingsAt(Route.SETTINGS_SPONSOR);
          toast.dismiss(t.id);
        }}
        className="whitespace-nowrap font-medium text-accent-claude transition-opacity hover:opacity-80"
      >
        {i18n.t('common:sponsorGated.learnMore')}
      </button>
    </span>
  ));
}
