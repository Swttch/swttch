import { SettingRow } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';
import {
  WHEEL_SCROLL_SPEED_DEFAULT,
  WHEEL_SCROLL_SPEED_MIN,
  WHEEL_SCROLL_SPEED_MAX,
  WHEEL_SCROLL_SPEED_STEP,
  clampWheelScrollSpeed,
} from '@/utils/wheelScrollSpeed';

/** How far one mouse wheel or trackpad movement scrolls the chat, as a multiplier. */
export function WheelScrollSpeedRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { updateSetting, scope, resetToGlobal } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  const raw = displaySettings[SettingKey.WHEEL_SCROLL_SPEED] as number | undefined;
  const inherited = isInherited(SettingKey.WHEEL_SCROLL_SPEED);

  return (
    <SettingRow
      label={t('appearance.scrolling.wheelScrollSpeed.label')}
      description={t('appearance.scrolling.wheelScrollSpeed.description', {
        min: WHEEL_SCROLL_SPEED_MIN,
        max: WHEEL_SCROLL_SPEED_MAX,
        value: WHEEL_SCROLL_SPEED_DEFAULT,
      })}
      isOverridden={isOverridden(SettingKey.WHEEL_SCROLL_SPEED)}
      isInherited={inherited}
      onResetToGlobal={resetFor(SettingKey.WHEEL_SCROLL_SPEED)}
    >
      <input
        type="number"
        min={WHEEL_SCROLL_SPEED_MIN}
        max={WHEEL_SCROLL_SPEED_MAX}
        step={WHEEL_SCROLL_SPEED_STEP}
        value={raw ?? WHEEL_SCROLL_SPEED_DEFAULT}
        onChange={(e) => {
          const value = e.target.value;
          if (value === '') {
            if (scope === 'project') resetToGlobal(SettingKey.WHEEL_SCROLL_SPEED);
            return;
          }
          const parsed = parseFloat(value);
          if (!Number.isFinite(parsed)) return;
          updateSetting(SettingKey.WHEEL_SCROLL_SPEED, clampWheelScrollSpeed(parsed));
        }}
        className={`min-w-32 max-w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
          inherited ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      />
    </SettingRow>
  );
}
