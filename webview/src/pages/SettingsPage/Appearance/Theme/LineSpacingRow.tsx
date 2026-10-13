import { SettingRow } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import {
  SettingKey,
  LINE_HEIGHT_DEFAULT,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_STEP,
} from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/** How far apart the lines of a chat message sit, as a multiplier. */
export function LineSpacingRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { updateSetting, scope, resetToGlobal } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  const rawLineHeight = displaySettings[SettingKey.LINE_HEIGHT] as number | undefined;
  const inherited = isInherited(SettingKey.LINE_HEIGHT);

  return (
    <SettingRow
      label={t('appearance.theme.lineSpacing.label')}
      description={t('appearance.theme.lineSpacing.description')}
      isOverridden={isOverridden(SettingKey.LINE_HEIGHT)}
      isInherited={inherited}
      onResetToGlobal={resetFor(SettingKey.LINE_HEIGHT)}
    >
      <input
        type="number"
        min={LINE_HEIGHT_MIN}
        max={LINE_HEIGHT_MAX}
        step={LINE_HEIGHT_STEP}
        value={rawLineHeight ?? LINE_HEIGHT_DEFAULT}
        onChange={(e) => {
          const value = e.target.value;
          if (value === '') {
            if (scope === 'project') {
              resetToGlobal(SettingKey.LINE_HEIGHT);
            }
            return;
          }
          const parsed = parseFloat(value);
          if (!Number.isFinite(parsed)) return;
          updateSetting(SettingKey.LINE_HEIGHT, parsed);
        }}
        className={`min-w-32 max-w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
          inherited ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      />
    </SettingRow>
  );
}
