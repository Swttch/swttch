import { useState } from 'react';
import { AnnouncementPlacement } from '@/shared';
import { useTranslation } from '@/i18n';
import { InlineAnnouncementCard } from './InlineAnnouncementCard';
import { SessionManagerNoticeDetails } from './SessionManagerNoticeDetails';
import { dismissInline, useInlineDismissed } from './dismissed';
import type { InlineAnnouncement } from './types';

export const SESSION_MANAGER_NOTICE_ID = 'session-manager';

/**
 * Whether the notice about session management is worth the space right now: until it is closed.
 * The session manager is opt-in (the reader installs its package from Settings), so everyone who has not
 * closed the notice is told what it does.
 */
export function useSessionManagerNoticeRelevant(): boolean {
  return !useInlineDismissed(SESSION_MANAGER_NOTICE_ID);
}

export function SessionManagerNoticeCard() {
  const { t } = useTranslation('settings');
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <>
      <InlineAnnouncementCard
        title={t('general.sessionManager.announcement.title')}
        description={t('general.sessionManager.announcement.description')}
        footnote={
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="text-accent-primary underline underline-offset-2 hover:text-text-primary transition-colors"
          >
            {t('general.sessionManager.announcement.more')}
          </button>
        }
        onDismiss={() => dismissInline(SESSION_MANAGER_NOTICE_ID)}
      />
      {detailsOpen && <SessionManagerNoticeDetails onClose={() => setDetailsOpen(false)} />}
    </>
  );
}

export const sessionManagerNotice: InlineAnnouncement = {
  id: SESSION_MANAGER_NOTICE_ID,
  placement: AnnouncementPlacement.EMPTY_STATE,
  useIsRelevant: useSessionManagerNoticeRelevant,
  render: () => <SessionManagerNoticeCard />,
};
