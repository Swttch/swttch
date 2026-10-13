import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { useAutoOpenDiffEnabled } from '@/hooks/useIdeDiffAvailable';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether a proposed edit opens for review without being asked for.
 *
 * First in the section, because it decides whether the rows below describe
 * something that happens on its own or only when the file name is clicked. Off
 * is not a loss of the review — the change is still stored and the prompt still
 * links to it; it just stops arriving uninvited (#349).
 */
export function AutoOpenRow() {
  const { t } = useTranslation('settings');
  const { updateSetting } = useSettings();
  const isOverridden = useIsOverriddenByProject();
  const { isInherited, resetFor } = useDisplaySettings();
  const autoOpen = useAutoOpenDiffEnabled();

  return (
    <SettingRow
      label={t('diffView.autoOpen.label')}
      isOverridden={isOverridden(SettingKey.AUTO_OPEN_DIFF_ON_PERMISSION)}
      isInherited={isInherited(SettingKey.AUTO_OPEN_DIFF_ON_PERMISSION)}
      onResetToGlobal={resetFor(SettingKey.AUTO_OPEN_DIFF_ON_PERMISSION)}
      description={t('diffView.autoOpen.description')}
    >
      <ToggleSwitch
        checked={autoOpen}
        onChange={(checked) => updateSetting(SettingKey.AUTO_OPEN_DIFF_ON_PERMISSION, checked)}
        ariaLabel={t('diffView.autoOpen.label')}
      />
    </SettingRow>
  );
}
