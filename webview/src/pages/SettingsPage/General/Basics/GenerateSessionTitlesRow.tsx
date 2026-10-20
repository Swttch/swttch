import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether the first message of a new session also asks Claude Code for a title,
 * the way it names a session by itself in the terminal. Claude Code records the
 * title in the session, so every Claude Code client lists the session under it.
 * Off, a session is listed under what its messages say (#562).
 */
export function GenerateSessionTitlesRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { settings, updateSetting } = useSettings();
  const { isInherited, resetFor } = useDisplaySettings();

  return (
    <SettingRow
      label={t('general.generateSessionTitles.label')}
      description={t('general.generateSessionTitles.description')}
      isOverridden={isOverridden(SettingKey.GENERATE_SESSION_TITLES)}
      isInherited={isInherited(SettingKey.GENERATE_SESSION_TITLES)}
      onResetToGlobal={resetFor(SettingKey.GENERATE_SESSION_TITLES)}
    >
      <ToggleSwitch
        checked={settings[SettingKey.GENERATE_SESSION_TITLES]}
        onChange={(checked) => updateSetting(SettingKey.GENERATE_SESSION_TITLES, checked)}
        ariaLabel={t('general.generateSessionTitles.label')}
      />
    </SettingRow>
  );
}
