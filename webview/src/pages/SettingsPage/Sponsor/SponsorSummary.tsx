import { useState } from 'react';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import { useTranslation } from '@/i18n';
import { PRICING_URL } from '@/config/app';
import { getAdapter } from '@/adapters';
import type { SponsorPrice } from '@/hooks/queries/useSponsorStatus';

interface Props {
  licenseKey: string | null;
  /** Paid type as reported by the server; absent for legacy or comp keys. */
  tier: string | null;
  /** "monthly" | "yearly"; absent until a subscription resolves it. */
  interval: string | null;
  /** List price of the plan, when known. */
  price: SponsorPrice | null;
}

/** Mask all but the last 4 characters of a license key for display. */
function maskKey(key: string): string {
  if (key.length <= 4) return key;
  return '••••••••' + key.slice(-4);
}

/**
 * Render the plan as an amount rather than a cadence: "$5/mo" tells a sponsor
 * what they actually pay, where "Monthly" only tells them how often. Returns
 * null when the server has no price for this key (comp keys, or a subscription
 * whose interval has not resolved yet) so the chip is simply omitted.
 */
function formatPlan(price: SponsorPrice | null, interval: string | null): string | null {
  const period = interval === 'monthly' ? 'mo' : interval === 'yearly' ? 'yr' : null;
  if (price === null || period === null) return null;
  try {
    const amount = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: price.currency,
      maximumFractionDigits: 0,
    }).format(price.amount);
    return `${amount}/${period}`;
  } catch {
    // Unrecognised currency code — better a bare number than nothing.
    return `${price.amount} ${price.currency}/${period}`;
  }
}

/**
 * The "you're sponsoring" header: thanks, plan and key.
 *
 * Deliberately not a card. On a screen that is already a panel inside Settings,
 * boxing every group drew more borders than content.
 *
 * The key is masked but copyable in full — activating another machine needs the
 * whole key, and digging it out of an old email is a poor substitute.
 */
export function SponsorSummary(props: Props) {
  const { licenseKey, tier, interval, price } = props;
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

  const plan = formatPlan(price, interval);

  return (
    <div>
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
        {plan !== null && (
          <span className="rounded bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary">
            {plan}
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

      <p className="mt-3 text-sm text-text-secondary leading-relaxed break-keep">
        {/* The linked word is spliced in rather than embedded in one string, so
            no locale has to carry markup. */}
        {t('sponsor.active.thanksBefore')}
        <button
          type="button"
          onClick={() => void getAdapter().openUrl(PRICING_URL)}
          className="text-text-link underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          {t('sponsor.project')}
        </button>
        {t('sponsor.active.thanksAfter')}
      </p>
      <p className="mt-1 text-sm text-text-secondary leading-relaxed break-keep">
        {t('sponsor.active.promise')}
      </p>
    </div>
  );
}
