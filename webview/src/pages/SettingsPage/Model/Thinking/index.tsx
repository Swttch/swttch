import { SettingSection } from '../../common';
import { useTranslation } from '@/i18n';
import { ShowThinkingSummariesRow } from './ShowThinkingSummariesRow';

/** How Claude's thinking is shown in the conversation. */
export function ThinkingSection() {
  const { t } = useTranslation('settings');

  return (
    <SettingSection title={t('cli.model.thinkingSection')}>
      <ShowThinkingSummariesRow />
    </SettingSection>
  );
}
