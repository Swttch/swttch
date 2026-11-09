import { AnnouncementPlacement } from '@/shared';
import { Route } from '@/router';
import { openSettingsAt } from '@/utils/openSettingsAt';
import { useTranslation } from '@/i18n';
import { useTranscriptViewMode } from '@/pages/ChatPage/message-renderers/transcriptViewMode';
import { InlineAnnouncementCard } from './InlineAnnouncementCard';
import { dismissInline, useInlineDismissed } from './dismissed';
import type { InlineAnnouncement } from './types';

export const NEW_CHAT_UI_NOTICE_ID = 'new-chat-ui';

/**
 * Whether the notice about the new chat UI is worth the space right now: until it is closed, and only for someone
 * who is looking at the new views. A reader who already chose Classic does not need to be told how to choose it.
 */
export function useNewChatUiNoticeRelevant(): boolean {
  const dismissed = useInlineDismissed(NEW_CHAT_UI_NOTICE_ID);
  const view = useTranscriptViewMode();
  return !dismissed && view !== null;
}

export function NewChatUiNoticeCard() {
  const { t } = useTranslation('settings');
  const path = [
    t('layout.title'),
    t('appearance.title'),
    t('appearance.chat.sectionTitle'),
    t('appearance.transcriptViewMode.label'),
  ].join(' → ');

  return (
    <InlineAnnouncementCard
      title={t('appearance.transcriptViewMode.announcement.title')}
      description={`${t('appearance.transcriptViewMode.announcement.description')} ${t('appearance.transcriptViewMode.announcement.shortcut')}`}
      footnote={
        <>
          {t('appearance.transcriptViewMode.announcement.howTo', {
            path,
            classic: t('appearance.transcriptViewMode.classic'),
          })}{' '}
          <button
            type="button"
            onClick={() => void openSettingsAt(Route.SETTINGS_APPEARANCE)}
            className="text-accent-primary underline underline-offset-2 hover:text-text-primary transition-colors"
          >
            {t('appearance.transcriptViewMode.announcement.openSetting')}
          </button>
        </>
      }
      onDismiss={() => dismissInline(NEW_CHAT_UI_NOTICE_ID)}
    />
  );
}

export const newChatUiNotice: InlineAnnouncement = {
  id: NEW_CHAT_UI_NOTICE_ID,
  placement: AnnouncementPlacement.EMPTY_STATE,
  useIsRelevant: useNewChatUiNoticeRelevant,
  render: () => <NewChatUiNoticeCard />,
};
