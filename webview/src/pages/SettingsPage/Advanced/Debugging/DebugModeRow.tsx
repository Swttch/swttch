import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/** Whether the app keeps the noisy diagnostics on. */
export function DebugModeRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { updateSetting } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  const debugMode = (displaySettings[SettingKey.DEBUG_MODE] as boolean | undefined) ?? false;

  return (
    <SettingRow
      label={t('advanced.debugging.debugMode.label')}
      description={t('advanced.debugging.debugMode.description')}
      isOverridden={isOverridden(SettingKey.DEBUG_MODE)}
      isInherited={isInherited(SettingKey.DEBUG_MODE)}
      onResetToGlobal={resetFor(SettingKey.DEBUG_MODE)}
    >
      <ToggleSwitch
        checked={debugMode}
        onChange={(checked) => updateSetting(SettingKey.DEBUG_MODE, checked)}
      />
    </SettingRow>
  );
}
