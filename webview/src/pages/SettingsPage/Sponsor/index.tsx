import { useEffect, useState } from 'react';
import { HeartIcon } from '@heroicons/react/24/solid';
import { SponsorSummary } from './SponsorSummary';
import { SponsorLetter } from './SponsorLetter';
import { SponsorManageMenu } from './SponsorManageMenu';
import { SponsorTabs, SponsorTab } from './SponsorTabs';
import { SponsorBenefitsSection } from './SponsorBenefitsSection';
import { SponsorDevicesSection } from './SponsorDevicesSection';
import { SponsorBillingSection } from './SponsorBillingSection';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useAccounts } from '@/hooks/queries/useAccounts';
import { useSponsorStatus } from '@/hooks/queries/useSponsorStatus';
import { getAdapter } from '@/adapters';
import { MessageType, ErrorCode } from '@/shared';
import { PRICING_URL } from '@/config/app';
import { useTranslation } from '@/i18n';

/** ACK payload for GET_SPONSOR_URL — the backend-built pricing URL. */
interface SponsorUrlResponse {
  url?: string;
}

/** How often to ask www whether this install's key has been minted yet. */
const ACTIVATION_POLL_INTERVAL_MS = 5_000;

/**
 * How long to keep asking after the checkout page opens. Long enough to cover
 * paying in the browser and coming back; short enough that the poll cannot
 * quietly restore a key the user deactivates later in the same session.
 */
const ACTIVATION_POLL_WINDOW_MS = 10 * 60_000;

/**
 * Settings > Sponsor. The GUI stays free; this section lets users support the
 * project. "Learn more" opens the pricing page in the external browser — the
 * backend stamps the install id onto the URL (GET_SPONSOR_URL) so a completed
 * payment can be mapped back to this install without exposing the id to the
 * webview. Below that, an existing sponsor can activate their license key.
 *
 * There are no sponsor-only features to unlock yet; activation just records the
 * sponsor state (the feature-flag skeleton) for future gating.
 */
export function SponsorSettings() {
  const { t } = useTranslation('settings');
  const { send } = useBridgeContext();
  const { activeEmail } = useAccounts();
  const {
    isSponsor,
    licenseKey,
    tier,
    interval,
    price,
    cancellable,
    verify,
    deactivate,
    cancelSubscription,
    checkByInstall,
  } = useSponsorStatus();

  /**
   * Someone who sponsored before but is not entitled right now — cancelled and
   * lapsed, or refunded.
   *
   * They see the same invitation a first-time visitor sees, because re-starting
   * a sponsorship is the same act as starting one and deserves the same screen
   * rather than a lesser "you used to be a sponsor" variant. The single thing
   * they keep is their payment history: losing entitlement must not erase the
   * fact that they once paid, and their receipts are theirs.
   *
   * Note the condition is the KEY, not the entitlement — that is the whole point
   * of the split. `isSponsor` says what is unlocked today; `licenseKey` says
   * this install has been activated at some point.
   */
  const isPastSponsor = !isSponsor && licenseKey !== null;

  // Copy/paste-free activation: after the user opens the checkout page, poll www
  // for a key minted for this install so a completed payment flips this screen to
  // "sponsoring" without them copying the key back.
  //
  // Scoped deliberately to the checkout flow. Polling for as long as the screen
  // is open would also undo an explicit Deactivate: www still has the key linked
  // to this install id, so the very next tick would fetch and store it again.
  // Starting only on checkout — and stopping after a bounded window — keeps the
  // convenience without letting it overrule the user.
  const [checkoutStartedAt, setCheckoutStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (checkoutStartedAt === null || isSponsor) return;
    const id = window.setInterval(() => {
      if (Date.now() - checkoutStartedAt > ACTIVATION_POLL_WINDOW_MS) {
        setCheckoutStartedAt(null);
        return;
      }
      void checkByInstall();
    }, ACTIVATION_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [checkoutStartedAt, isSponsor, checkByInstall]);

  const [tab, setTab] = useState<SponsorTab>(SponsorTab.BENEFITS);
  const [opening, setOpening] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  // Which failure to explain, or null while there is nothing to report. Held as
  // the code rather than a boolean because "we could not reach the server" and
  // "that key is wrong" send the user to different places.
  const [failure, setFailure] = useState<ErrorCode | null>(null);

  const handleSponsor = async () => {
    if (opening) return;
    setOpening(true);
    // Opening checkout is what arms the auto-activation poll — see above.
    setCheckoutStartedAt(Date.now());
    try {
      const res = (await send(MessageType.GET_SPONSOR_URL, {
        email: activeEmail ?? undefined,
      })) as SponsorUrlResponse | null;
      const url = res && typeof res.url === 'string' ? res.url : PRICING_URL;
      await getAdapter().openUrl(url);
    } catch {
      // Never leave the user stuck: fall back to the bare pricing page (no
      // install-id prefill) if the backend request fails.
      await getAdapter().openUrl(PRICING_URL);
    } finally {
      setOpening(false);
    }
  };

  // Deactivating is an explicit "stop treating me as a sponsor here", so it also
  // disarms any activation poll still in its window — otherwise a user who paid,
  // then changed their mind minutes later, would watch the key come straight back.
  const handleDeactivate = async () => {
    setCheckoutStartedAt(null);
    await deactivate();
  };

  const handleActivate = async () => {
    const key = keyInput.trim();
    if (key === '' || verifying) return;
    setVerifying(true);
    setFailure(null);
    try {
      const result = await verify(key);
      if (result.valid) {
        setKeyInput('');
      } else {
        setFailure(result.errorCode ?? ErrorCode.SPONSOR_KEY_INVALID);
      }
    } finally {
      setVerifying(false);
    }
  };

  const promises = t('sponsor.promises', { returnObjects: true }) as string[];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2.5 mb-5">
        <HeartIcon className="w-5 h-5 text-accent-primary" />
        <h2 className="text-xl font-semibold text-text-primary">
          {/* Someone already sponsoring is greeted, not pitched to. */}
          {isSponsor ? t('sponsor.active.greeting') : t('sponsor.title')}
        </h2>
      </div>

      {/* Intro + pricing entry point. Hidden for sponsors: the pitch (what you
          get, "Learn more", "Cancel anytime") is aimed at people deciding, and
          reads as if they had not already paid. */}
      {!isSponsor && (
      <div className="rounded-xl border border-border-default bg-surface-raised p-6">
        {/* Authored line breaks, same as the letter — one clause per line. */}
        <p className="text-sm text-text-secondary leading-relaxed break-keep">
          {(t('sponsor.description', { returnObjects: true }) as string[]).map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>

        {/* The "why sponsorship?" letter follows the ask and stays collapsed:
            it answers the question the ask raises, for whoever wants it, without
            the screen opening on an appeal. */}
        <div className="mt-3">
          <SponsorLetter />
        </div>

        <ul className="mt-5 space-y-3">
          {promises.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-text-primary">
              <HeartIcon className="w-4 h-4 mt-[3px] flex-shrink-0 text-accent-primary" />
              <span className="leading-relaxed break-keep">{item}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => void handleSponsor()}
          disabled={opening}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent-primary px-5 py-2.5 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <HeartIcon className="w-4 h-4" />
          {opening ? t('sponsor.opening') : t('sponsor.cta')}
        </button>

        <p className="mt-4 text-xs text-text-tertiary leading-relaxed">
          {t('sponsor.trust')}
        </p>
        {/* What sponsorship does NOT change. Same fine-print voice as "Cancel
            anytime" and placed below the CTA: it reassures rather than sells, so
            it should not compete with the ask above it. */}
        <p className="mt-2 text-xs text-text-tertiary leading-relaxed break-keep">
          {t('sponsor.openSourceNote')}
        </p>
      </div>
      )}

      {isSponsor ? (
        <>
          <SponsorSummary
            licenseKey={licenseKey}
            tier={tier}
            interval={interval}
            price={price}
          />

          {/* One section at a time: stacked, they were a long scroll of cards
              where only one is ever relevant. */}
          <SponsorTabs active={tab} onChange={setTab} />
          {tab === SponsorTab.BENEFITS && <SponsorBenefitsSection />}
          {tab === SponsorTab.DEVICES && <SponsorDevicesSection />}
          {tab === SponsorTab.BILLING && <SponsorBillingSection />}

          {/* Stopping sits last and stays quiet on purpose: it is what the
              sponsor is least likely to want, and leading with it made the
              screen read as an exit prompt. */}
          <div className="mt-6 flex justify-end">
            <SponsorManageMenu
              cancellable={cancellable}
              onClearKey={handleDeactivate}
              onCancelSubscription={cancelSubscription}
            />
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-border-default bg-surface-raised p-6">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t('sponsor.activate.title')}</h3>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed break-keep">
              {t('sponsor.activate.description')}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={keyInput}
                onChange={(e) => { setKeyInput(e.target.value); setFailure(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleActivate(); }}
                placeholder={t('sponsor.activate.placeholder')}
                spellCheck={false}
                autoComplete="off"
                className="flex-1 rounded-lg border border-border-default bg-surface-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleActivate()}
                disabled={verifying || keyInput.trim() === ''}
                className="inline-flex items-center justify-center rounded-lg bg-accent-primary px-5 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {verifying ? t('sponsor.activate.verifying') : t('sponsor.activate.button')}
              </button>
            </div>
            {failure !== null && (
              <p
                role="alert"
                className={`mt-2 text-xs leading-relaxed ${
                  // Being unable to reach us is not the user's mistake, so it is
                  // not dressed as an input error the way a bad key is.
                  failure === ErrorCode.SPONSOR_VERIFY_UNREACHABLE
                    ? 'text-text-secondary'
                    : 'text-red-500'
                }`}
              >
                {failure === ErrorCode.SPONSOR_VERIFY_UNREACHABLE
                  ? t('sponsor.activate.unreachable')
                  : t('sponsor.activate.invalid')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* A past sponsor keeps their receipts. Rendered outside the entitlement
          branch above precisely so it does not need a past-sponsor variant of
          the invitation: they get the ordinary screen, plus this. */}
      {isPastSponsor && (
        <div className="mt-6 rounded-xl border border-border-default bg-surface-raised px-6 pb-6">
          <SponsorBillingSection />
        </div>
      )}
    </div>
  );
}
