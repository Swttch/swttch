import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/** Whether inserting a file path from the editor also moves the cursor to the chat. */
export function FocusInputRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { updateSetting } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  const focusInputOnEditorContext = displaySettings[SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT] ?? true;

  return (
    <SettingRow
      label={t('ide.focusInputOnEditorContext.label')}
      description={t('ide.focusInputOnEditorContext.description')}
      isOverridden={isOverridden(SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT)}
      isInherited={isInherited(SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT)}
      onResetToGlobal={resetFor(SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT)}
    >
      <ToggleSwitch
        checked={focusInputOnEditorContext}
        onChange={(checked) => updateSetting(SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT, checked)}
        ariaLabel={t('ide.focusInputOnEditorContext.label')}
      />
    </SettingRow>
  );
}
