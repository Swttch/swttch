import { SettingRow } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/** The interface's base font size, in pixels. */
export function FontSizeRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting, scope, resetToGlobal } = useSettings();

  const rawFontSize = scopeSettings[SettingKey.FONT_SIZE] as number | undefined;
  const isNotSet = rawFontSize === undefined && scope === 'project';

  return (
    <SettingRow
      label={t('appearance.theme.fontSize.label')}
      description={t('appearance.theme.fontSize.description')}
      isOverridden={isOverridden(SettingKey.FONT_SIZE)}
    >
      <input
        type="number"
        min="8"
        max="32"
        value={isNotSet ? '' : (rawFontSize ?? 13)}
        placeholder={isNotSet ? t('appearance.theme.fontSize.notSetPlaceholder') : undefined}
        onChange={(e) => {
          const value = e.target.value;
          // Emptying the field at project scope is how the project stops
          // overriding, rather than how it stores a blank size.
          if (value === '') {
            if (scope === 'project') {
              resetToGlobal(SettingKey.FONT_SIZE);
            }
            return;
          }
          updateSetting(SettingKey.FONT_SIZE, parseInt(value, 10));
        }}
        className={`min-w-32 max-w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
          isNotSet ? 'text-text-tertiary italic' : 'text-text-primary'
        }`}
      />
    </SettingRow>
  );
}
