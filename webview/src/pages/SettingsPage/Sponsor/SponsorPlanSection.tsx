import { useState } from 'react';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import { useTranslation } from '@/i18n';

interface Props {
  licenseKey: string | null;
  /** Paid tier as reported by the server; absent for legacy or comp keys. */
  tier: string | null;
  /** "monthly" | "yearly"; absent until a subscription resolves it. */
  interval: string | null;
}

/** Mask all but the last 4 characters of a license key for display. */
function maskKey(key: string): string {
  if (key.length <= 4) return key;
  return '••••••••' + key.slice(-4);
}

/**
 * "You're sponsoring" — the plan, and the key itself.
 *
 * The key is masked by default but copyable in full: a sponsor needs the whole
 * key to activate another machine, and re-finding it in an old email is a poor
 * substitute for having it here.
 */
export function SponsorPlanSection(props: Props) {
  const { licenseKey, tier, interval } = props;
  const { t } = useTranslation('settings');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (licenseKey === null) return;
    try {
      await navigator.clipboard.writeText(licenseKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied (permissions, insecure context); leaving the
      // label unchanged is a truthful "nothing was copied".
    }
  };

  const intervalLabel =
    interval === 'monthly'
      ? t('sponsor.plan.monthly')
      : interval === 'yearly'
        ? t('sponsor.plan.yearly')
        : t('sponsor.plan.unknown');

  return (
    <div className="rounded-xl border border-border-default bg-surface-raised p-6">
      <div className="flex items-center gap-2">
        <CheckBadgeIcon className="w-5 h-5 text-accent-primary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('sponsor.active.title')}</h3>
      </div>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed break-keep">
        {t('sponsor.active.description')}
      </p>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
        {tier !== null && (
          <>
            <dt className="text-text-tertiary">{t('sponsor.plan.tier')}</dt>
            <dd className="text-text-secondary">{tier}</dd>
          </>
        )}
        <dt className="text-text-tertiary">{t('sponsor.plan.interval')}</dt>
        <dd className="text-text-secondary">{intervalLabel}</dd>

        {licenseKey !== null && (
          <>
            <dt className="text-text-tertiary">{t('sponsor.active.keyLabel')}</dt>
            <dd className="flex items-center gap-2">
              <span className="font-mono text-text-secondary">{maskKey(licenseKey)}</span>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="rounded border border-border-default px-2 py-0.5 text-[0.7rem] text-text-tertiary transition-colors hover:text-text-primary hover:bg-surface-hover"
              >
                {copied ? t('sponsor.copyKey.copied') : t('sponsor.copyKey.copy')}
              </button>
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
