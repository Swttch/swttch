import { SettingSection } from '../../common';
import { HideToolCallsRow } from './HideToolCallsRow';
import { useTranslation } from '@/i18n';

/** How much of a turn the chat shows: the work, or only the answer. */
export function ChatSection() {
  const { t } = useTranslation('settings');

  return (
    <SettingSection title={t('appearance.chat.sectionTitle')}>
      <HideToolCallsRow />
    </SettingSection>
  );
}
