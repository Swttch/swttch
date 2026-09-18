import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/** Whether the app keeps the noisy diagnostics on. */
export function DebugModeRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting, scope } = useSettings();

  const raw = scopeSettings[SettingKey.DEBUG_MODE] as boolean | undefined;
  const isNotSet = raw === undefined && scope === 'project';

  return (
    <SettingRow
      label={t('advanced.debugging.debugMode.label')}
      description={t('advanced.debugging.debugMode.description')}
      isOverridden={isOverridden(SettingKey.DEBUG_MODE)}
    >
      {isNotSet ? (
        // At project scope with nothing stored, the switch shows off and says
        // why beside it: off and "not set" look identical otherwise, and the
        // difference decides whether the global value applies.
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary italic">
            {t('advanced.debugging.debugMode.notSet')}
          </span>
          <ToggleSwitch
            checked={false}
            onChange={(checked) => updateSetting(SettingKey.DEBUG_MODE, checked)}
            disabled={false}
          />
        </div>
      ) : (
        <ToggleSwitch
          checked={raw ?? false}
          onChange={(checked) => updateSetting(SettingKey.DEBUG_MODE, checked)}
        />
      )}
    </SettingRow>
  );
}
