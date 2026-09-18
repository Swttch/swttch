import { SettingSection } from '../../common';
import { AutoScrollThresholdRow } from './AutoScrollThresholdRow';
import { useTranslation } from '@/i18n';

/** When the chat follows the stream, and when it lets the reader stay put. */
export function ScrollingSection() {
  const { t } = useTranslation('settings');

  return (
    <SettingSection title={t('appearance.scrolling.sectionTitle')}>
      <AutoScrollThresholdRow />
    </SettingSection>
  );
}
