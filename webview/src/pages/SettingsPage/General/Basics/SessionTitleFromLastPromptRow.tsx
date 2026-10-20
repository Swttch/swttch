import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether a session that has neither a name nor a generated title is listed under
 * the latest message sent in it. That is how Claude Code's own clients list it, so
 * it is on by default; off, the session is listed under its first message (#562).
 */
export function SessionTitleFromLastPromptRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { settings, updateSetting } = useSettings();
  const { isInherited, resetFor } = useDisplaySettings();

  return (
    <SettingRow
      label={t('general.sessionTitleFromLastPrompt.label')}
      description={t('general.sessionTitleFromLastPrompt.description')}
      isOverridden={isOverridden(SettingKey.SESSION_TITLE_FROM_LAST_PROMPT)}
      isInherited={isInherited(SettingKey.SESSION_TITLE_FROM_LAST_PROMPT)}
      onResetToGlobal={resetFor(SettingKey.SESSION_TITLE_FROM_LAST_PROMPT)}
    >
      <ToggleSwitch
        checked={settings[SettingKey.SESSION_TITLE_FROM_LAST_PROMPT]}
        onChange={(checked) => updateSetting(SettingKey.SESSION_TITLE_FROM_LAST_PROMPT, checked)}
        ariaLabel={t('general.sessionTitleFromLastPrompt.label')}
      />
    </SettingRow>
  );
}
