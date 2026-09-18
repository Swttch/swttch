import { SettingSection } from '../../common';
import { DefaultModeRow } from './DefaultModeRow';
import { useTranslation } from '@/i18n';

/** Which permission mode a new session opens in. */
export function DefaultModeSection() {
  const { t } = useTranslation('settings');

  return (
    <SettingSection title={t('permissions.defaultMode.sectionTitle')}>
      <DefaultModeRow />
    </SettingSection>
  );
}
