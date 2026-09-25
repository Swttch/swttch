import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Drops the cards for the tools that only look or run, leaving the prompt, the
 * reply and the file changes: the CLI's focus view (`/focus`,
 * `"viewMode": "focus"`), which never reached us because it configures the ink
 * renderer and the chat here is our own (issue #475). Off by default: showing
 * the work is what the transcript has always done. What stays is listed in
 * `hideToolCalls.ts`.
 */
export function HideToolCallsRow() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useSettings();

  return (
    <SettingRow
      label={t('appearance.hideToolCalls.label')}
      description={t('appearance.hideToolCalls.description')}
      isOverridden={isOverridden(SettingKey.HIDE_TOOL_CALLS)}
    >
      <ToggleSwitch
        checked={scopeSettings[SettingKey.HIDE_TOOL_CALLS] === true}
        onChange={(checked) => updateSetting(SettingKey.HIDE_TOOL_CALLS, checked)}
        ariaLabel={t('appearance.hideToolCalls.label')}
      />
    </SettingRow>
  );
}
