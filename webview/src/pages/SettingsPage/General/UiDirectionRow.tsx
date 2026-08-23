import { SettingRow } from '../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, UiDirection } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Toggles UI mirroring: flips the interface layout direction between LTR
 * (default) and RTL. Applied to <html dir> by SettingsContext. App-global
 * behaviour → written to global scope, like ChatPaginationRow/HostModeRow.
 */
export function UiDirectionRow() {
  const isOverridden = useIsOverriddenByProject();
  const { settings, updateSettingWithScope } = useSettings();
  const { t } = useTranslation('settings');

  const enabled = settings[SettingKey.UI_DIRECTION] === UiDirection.RTL;

  return (
    <SettingRow label={t('general.uiDirection.label')} isOverridden={isOverridden(SettingKey.UI_DIRECTION)}>
      <ToggleSwitch
        checked={enabled}
        onChange={(checked) =>
          updateSettingWithScope(SettingKey.UI_DIRECTION, checked ? UiDirection.RTL : UiDirection.LTR, 'global')
        }
        ariaLabel={t('general.uiDirection.label')}
      />
    </SettingRow>
  );
}
