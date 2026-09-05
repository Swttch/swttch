import { AnnouncementPlacement } from '@/shared';
import { Route } from '@/router';
import { openSettingsAt } from '@/utils/openSettingsAt';
import { useAccounts } from '@/hooks/queries/useAccounts';
import { useTranslation } from '@/i18n';
import { InlineAnnouncementCard } from './InlineAnnouncementCard';
import { dismissInline, useInlineDismissed } from './dismissed';
import type { InlineAnnouncement } from './types';

export const ACCOUNT_POOL_NUDGE_ID = 'account-pool-nudge';

/**
 * Whether telling someone about account pools is worth the space right now.
 *
 * From the moment a second account exists until the first pool is made: before
 * that there is nothing to pair with, and after it the feature has been found.
 * Pooling is discovered by dragging one account onto another and holding, which
 * nobody would guess at unaided — hence saying so at all.
 */
export function useAccountPoolNudgeRelevant(): boolean {
  const { accounts, accountPools } = useAccounts();
  const dismissed = useInlineDismissed(ACCOUNT_POOL_NUDGE_ID);
  return !dismissed && accounts.length >= 2 && accountPools.length === 0;
}

interface CardProps {
  /**
   * True on the screen where accounts can actually be dragged. Elsewhere the
   * instructions would describe something the reader cannot do from where they
   * are standing, so they get a way to get there instead.
   */
  actionable?: boolean;
}

export function AccountPoolNudgeCard(props: CardProps = {}) {
  const { actionable = false } = props;
  const { t } = useTranslation('settings');

  return (
    <InlineAnnouncementCard
      title={t('account.pool.nudge.title')}
      description={t('account.pool.nudge.description')}
      footnote={actionable ? t('account.pool.nudge.howTo') : (
        <button
          type="button"
          onClick={() => void openSettingsAt(Route.SETTINGS_ACCOUNT)}
          className="text-accent-primary underline underline-offset-2 hover:text-text-primary transition-colors"
        >
          {t('account.pool.nudge.learnMore')}
        </button>
      )}
      onDismiss={() => dismissInline(ACCOUNT_POOL_NUDGE_ID)}
    />
  );
}

export const accountPoolNudge: InlineAnnouncement = {
  id: ACCOUNT_POOL_NUDGE_ID,
  placement: AnnouncementPlacement.EMPTY_STATE,
  useIsRelevant: useAccountPoolNudgeRelevant,
  render: () => <AccountPoolNudgeCard />,
};
