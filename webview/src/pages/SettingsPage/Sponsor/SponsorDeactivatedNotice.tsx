import { useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

interface Props {
  /** ISO 8601 — when this device switched sponsorship off. */
  deactivatedAt: string;
  /** Switch this device back on: lifts the deactivation and re-claims the key. */
  onReactivate: () => Promise<boolean>;
}

/**
 * Shown to someone who switched sponsorship off on THIS device.
 *
 * Without it their screen is the one a first-time visitor sees: an invitation to
 * sponsor. That is wrong twice over — their subscription may still be charging
 * them, and the menu holding "Cancel sponsorship" only renders for an active
 * sponsor, so the screen that pitches sponsorship is also the screen with no way
 * to stop paying for it.
 *
 * So this says what happened, warns that billing is a separate thing, and offers
 * the one action that leads anywhere: switch back on. Doing that restores the
 * sponsor screen, and with it the cancel menu — the honest route to "stop
 * charging me" runs through being recognised as a sponsor again.
 */
export function SponsorDeactivatedNotice({ deactivatedAt, onReactivate }: Props) {
  const { t } = useTranslation('settings');
  const [busy, setBusy] = useState(false);

  // Locale-aware and forgiving: a stored value we cannot parse must not break
  // the notice, which matters more than the date it carries.
  const parsed = new Date(deactivatedAt);
  const when = Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString();

  const handleReactivate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onReactivate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-border-default bg-surface-raised p-6">
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="mt-[2px] h-5 w-5 flex-shrink-0 text-text-tertiary" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">
            {t('sponsor.deactivated.title')}
          </h3>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed break-keep">
            {when === null
              ? t('sponsor.deactivated.description')
              : t('sponsor.deactivated.descriptionOn', { date: when })}
          </p>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed break-keep">
            {t('sponsor.deactivated.billingNote')}
          </p>

          <button
            type="button"
            onClick={() => void handleReactivate()}
            disabled={busy}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? t('sponsor.deactivated.reactivating') : t('sponsor.deactivated.reactivate')}
          </button>
          <p className="mt-3 text-xs text-text-tertiary leading-relaxed break-keep">
            {t('sponsor.deactivated.cancelHint')}
          </p>
        </div>
      </div>
    </div>
  );
}
