import { useState } from 'react';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import { useTranslation } from '@/i18n';

interface Props {
  licenseKey: string | null;
  /** Paid type as reported by the server; absent for legacy or comp keys. */
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
 * The "you're sponsoring" banner: status, plan and key on one line.
 *
 * Kept deliberately compact — these are facts a sponsor glances at, not things
 * they act on, so they should not cost a full card each. What they DO act on
 * lives in the tabs below.
 *
 * The key is masked but copyable in full: activating another machine needs the
 * whole key, and digging it out of an old email is a poor substitute.
 */
export function SponsorSummary(props: Props) {
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
        : null;

  return (
    <div className="rounded-xl border border-border-default bg-surface-raised px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5">
          <CheckBadgeIcon className="w-4 h-4 text-accent-primary" />
          <span className="text-sm font-semibold text-text-primary">
            {t('sponsor.active.title')}
          </span>
        </span>

        {tier !== null && (
          <span className="rounded bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary">
            {tier}
          </span>
        )}
        {intervalLabel !== null && (
          <span className="rounded bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary">
            {intervalLabel}
          </span>
        )}

        {licenseKey !== null && (
          <span className="ms-auto inline-flex items-center gap-2">
            <span className="font-mono text-xs text-text-tertiary">{maskKey(licenseKey)}</span>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="rounded border border-border-default px-2 py-0.5 text-[0.7rem] text-text-tertiary transition-colors hover:text-text-primary hover:bg-surface-hover"
            >
              {copied ? t('sponsor.copyKey.copied') : t('sponsor.copyKey.copy')}
            </button>
          </span>
        )}
      </div>

      <p className="mt-2 text-xs text-text-tertiary leading-relaxed break-keep">
        {t('sponsor.active.description')}
      </p>
    </div>
  );
}
