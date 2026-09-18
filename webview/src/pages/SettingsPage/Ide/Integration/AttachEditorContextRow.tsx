import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/** Whether a new session starts with the editor-context chip already active. */
export function AttachEditorContextRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useSettings();

  // Seeds the chip at the start of a session (#237). Only an explicit false
  // disables it, so `!== false` rather than the `?? true` the other toggles
  // use — anything unreadable must leave the feature on.
  const attachEditorContext = scopeSettings[SettingKey.ATTACH_EDITOR_CONTEXT] !== false;

  return (
    <SettingRow
      label={t('ide.attachEditorContext.label')}
      description={t('ide.attachEditorContext.description')}
      isOverridden={isOverridden(SettingKey.ATTACH_EDITOR_CONTEXT)}
    >
      <ToggleSwitch
        checked={attachEditorContext}
        onChange={(checked) => updateSetting(SettingKey.ATTACH_EDITOR_CONTEXT, checked)}
        ariaLabel={t('ide.attachEditorContext.label')}
      />
    </SettingRow>
  );
}
