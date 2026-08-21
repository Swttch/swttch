import { SettingRow } from '../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';

/**
 * Folds long lines in diffs and tool input/output to the block's width rather
 * than scrolling them sideways (issue #179). Off by default: horizontal scroll
 * is what the transcript has always done, so wrapping is the deviation to opt
 * into, not the other way round.
 */
export function SoftWrapRow() {
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useSettings();

  return (
    <SettingRow
      label={t('appearance.softWrap.label')}
      description={t('appearance.softWrap.description')}
    >
      <ToggleSwitch
        checked={scopeSettings[SettingKey.SOFT_WRAP] === true}
        onChange={(checked) => updateSetting(SettingKey.SOFT_WRAP, checked)}
        ariaLabel={t('appearance.softWrap.label')}
      />
    </SettingRow>
  );
}
