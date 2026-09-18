import { SettingSection } from '../../common';
import { DebugModeRow } from './DebugModeRow';
import { LogLevelRow } from './LogLevelRow';
import { useTranslation } from '@/i18n';

/** What the app records about itself while it runs. */
export function DebuggingSection() {
  const { t } = useTranslation('settings');

  return (
    <SettingSection title={t('advanced.debugging.sectionTitle')}>
      <DebugModeRow />
      <LogLevelRow />
    </SettingSection>
  );
}
