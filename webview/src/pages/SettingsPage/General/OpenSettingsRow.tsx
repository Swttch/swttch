import { SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, OpenSettingsMode } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Lets the user choose how the Settings screen opens from the gear button:
 * an overlay over the current session (keeps a running session intact) or a
 * dedicated new tab. App-global behaviour, so always written to the global scope.
 */
export function OpenSettingsRow() {
  const isOverridden = useIsOverriddenByProject();
  const { settings, updateSettingWithScope } = useSettings();
  const { t } = useTranslation('settings');

  const mode = settings[SettingKey.OPEN_SETTINGS_AS] ?? OpenSettingsMode.OVERLAY;

  const openSettingsOptions: SelectOption[] = [
    { value: OpenSettingsMode.OVERLAY, label: t('general.openSettings.overlay') },
    { value: OpenSettingsMode.NEW_TAB, label: t('general.openSettings.newTab') },
  ];

  return (
    <SettingRow
      label={t('general.openSettings.label')}
      description={t('general.openSettings.description')}
      isOverridden={isOverridden(SettingKey.OPEN_SETTINGS_AS)}
    >
      <Select
        value={mode}
        options={openSettingsOptions}
        ariaLabel={t('general.openSettings.label')}
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
        onChange={(value) => updateSettingWithScope(SettingKey.OPEN_SETTINGS_AS, value as OpenSettingsMode, 'global')}
      />
    </SettingRow>
  );
}
