import { SettingRow } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';
import {
  AUTO_SCROLL_THRESHOLD_DEFAULT,
  AUTO_SCROLL_THRESHOLD_MIN,
  AUTO_SCROLL_THRESHOLD_MAX,
  clampAutoScrollThreshold,
} from '@/utils/autoScroll';

/** How far back up the user has to scroll before auto-scrolling gives way. */
export function AutoScrollThresholdRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting, scope, resetToGlobal } = useSettings();

  const raw = scopeSettings[SettingKey.AUTO_SCROLL_THRESHOLD] as number | undefined;
  const isNotSet = raw === undefined && scope === 'project';

  return (
    <SettingRow
      label={t('appearance.scrolling.autoScrollThreshold.label')}
      description={t('appearance.scrolling.autoScrollThreshold.description', {
        value: AUTO_SCROLL_THRESHOLD_DEFAULT,
      })}
      isOverridden={isOverridden(SettingKey.AUTO_SCROLL_THRESHOLD)}
    >
      <input
        type="number"
        min={AUTO_SCROLL_THRESHOLD_MIN}
        max={AUTO_SCROLL_THRESHOLD_MAX}
        step="1"
        value={isNotSet ? '' : (raw ?? AUTO_SCROLL_THRESHOLD_DEFAULT)}
        placeholder={
          isNotSet ? t('appearance.scrolling.autoScrollThreshold.notSetPlaceholder') : undefined
        }
        onChange={(e) => {
          const value = e.target.value;
          if (value === '') {
            if (scope === 'project') {
              resetToGlobal(SettingKey.AUTO_SCROLL_THRESHOLD);
            }
            return;
          }
          const parsed = parseInt(value, 10);
          if (!Number.isInteger(parsed)) return;
          updateSetting(SettingKey.AUTO_SCROLL_THRESHOLD, clampAutoScrollThreshold(parsed));
        }}
        className={`min-w-32 max-w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
          isNotSet ? 'text-text-tertiary italic' : 'text-text-primary'
        }`}
      />
    </SettingRow>
  );
}
