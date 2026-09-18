import { SettingSection } from '../../common';
import { BypassModeRow } from './BypassModeRow';
import { useTranslation } from '@/i18n';

/** Whether the mode that skips every permission prompt may be reached. */
export function BypassModeSection() {
  const { t } = useTranslation('settings');

  return (
    <SettingSection title={t('permissions.bypassMode.sectionTitle')}>
      <BypassModeRow />
    </SettingSection>
  );
}
