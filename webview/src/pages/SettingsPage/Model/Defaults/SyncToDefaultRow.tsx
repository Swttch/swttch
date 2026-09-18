import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether changing one session's model also moves the default every new session
 * starts on, the way the CLI's own `/model` does.
 */
export function SyncToDefaultRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { settings, updateSetting } = useSettings();

  return (
    <SettingRow
      label={t('cli.model.syncToDefault.label')}
      description={t('cli.model.syncToDefault.description')}
      isOverridden={isOverridden(SettingKey.SYNC_MODEL_TO_DEFAULT)}
    >
      <ToggleSwitch
        checked={settings[SettingKey.SYNC_MODEL_TO_DEFAULT]}
        onChange={(checked) => updateSetting(SettingKey.SYNC_MODEL_TO_DEFAULT, checked)}
        ariaLabel={t('cli.model.syncToDefault.label')}
      />
    </SettingRow>
  );
}
