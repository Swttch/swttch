import React from 'react';
import { useTranslation } from '@/i18n';
import { openSettingsAt } from '@/utils/openSettingsAt';
import { Route } from '@/router';
import { SponsorGate, SponsorGateStep, type SponsorGateSurface } from '@/shared';
import { reportSponsorGate } from '@/utils/reportSponsorGate';

/**
 * The one place the sponsor invitation is written.
 *
 * Every viewer shows this, whichever door opened it. It used to be built twice —
 * once in the transcript and once in the Assets screen — and the two drifted:
 * the Assets copy had no way to act on and reported nothing, so the screen where
 * a user has just seen every thumbnail, the exact moment the gate is meant to
 * land, was both mute and unmeasured.
 */

/**
 * Says how much of the session the counter below is not counting.
 *
 * For a non-sponsor the panel reads "1 / 1" while the session holds two dozen,
 * so this line exists to correct that: the number here is the rest.
 *
 * Which is why its action opens the Assets screen rather than the sponsor page.
 * Someone reading "23 more in this session" wants to SEE those 23, and all 23
 * are already theirs to look at. Sending them to a payment page to answer "where
 * are they?" would be selling at a question, and the Assets screen makes the
 * offer again anyway, next to the thumbnails that give it weight.
 *
 * The arrow tooltip is the opposite case and keeps its sponsor link: someone
 * pressing an arrow wants to keep MOVING, and moving is the thing sponsorship
 * actually buys.
 */
export const MoreInSessionNotice: React.FC<{ count: number; onShowAll: () => void }> = ({
  count,
  onShowAll,
}) => {
  const { t } = useTranslation('chatTools');
  const { t: tChat } = useTranslation('chat');

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-surface-hover/90 border border-border-default text-text-secondary text-xs">
      <span>{t('attachments.lightbox.moreInSession', { count })}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onShowAll();
        }}
        className="whitespace-nowrap font-medium text-accent-claude transition-opacity hover:opacity-80"
      >
        {tChat('assets.showAll')}
      </button>
    </div>
  );
};

/**
 * The same offer, sized for a tooltip on an arrow that cannot move.
 *
 * Carries the link too: an arrow that explains why it stopped and then leaves
 * the user to go hunting for the sponsor page has only half-answered.
 *
 * Stacked, because the line itself is authored with its own breaks (the tooltip
 * keeps them; the Assets header, which has no pre-wrap, folds them back into one
 * flowing line). Beside a several-line message the link would float against the
 * middle of it, pointing at nothing.
 */
export const EdgeSponsorHint: React.FC<{ from: SponsorGateSurface }> = ({ from }) => {
  const { t } = useTranslation('chat');

  return (
    /*
      Held to 170px: the shared Tooltip allows 32rem, which let this line run
      most of the way across the viewer as one long strip. 170px is the widest
      authored Korean line (130px) plus a margin, so the written breaks survive
      and every other language wraps into a block of the same shape.

      break-keep undoes the Tooltip's break-all, which at this width would snap
      English words in half mid-letter.
    */
    <span className="flex max-w-[170px] flex-col items-start gap-1.5 break-keep">
      <span>{t('assets.sponsorHint')}</span>
      <LearnMoreButton from={from} />
    </span>
  );
};

/**
 * Follows the invitation to the sponsor page, recording that it was followed.
 *
 * The report is here rather than at each call site so that no future placement
 * of this offer can forget it — the conversion rate is the numerator's only
 * source.
 */
export function LearnMoreButton({ from }: { from: SponsorGateSurface }) {
  const { t: tc } = useTranslation('common');

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        reportSponsorGate(SponsorGate.Assets, SponsorGateStep.Clicked, { from });
        void openSettingsAt(Route.SETTINGS_SPONSOR);
      }}
      className="whitespace-nowrap font-medium text-accent-claude transition-opacity hover:opacity-80"
    >
      {tc('sponsorGated.learnMore')}
    </button>
  );
}
