import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, ContextBadgeDisplay } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/** What the context badge under the chat input writes next to its ring. */
export function ContextBadgeDisplayRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { updateSetting } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  const value = displaySettings[SettingKey.CONTEXT_BADGE_DISPLAY] ?? ContextBadgeDisplay.PERCENT;

  const options: SelectOption[] = [
    { value: ContextBadgeDisplay.PERCENT, label: t('general.composer.contextBadge.percent') },
    { value: ContextBadgeDisplay.TOKENS, label: t('general.composer.contextBadge.tokens') },
    { value: ContextBadgeDisplay.NONE, label: t('general.composer.contextBadge.none') },
  ];

  return (
    <SettingRow
      label={t('general.composer.contextBadge.label')}
      description={t('general.composer.contextBadge.description')}
      isOverridden={isOverridden(SettingKey.CONTEXT_BADGE_DISPLAY)}
      isInherited={isInherited(SettingKey.CONTEXT_BADGE_DISPLAY)}
      onResetToGlobal={resetFor(SettingKey.CONTEXT_BADGE_DISPLAY)}
    >
      <Select
        value={value}
        options={options}
        ariaLabel={t('general.composer.contextBadge.label')}
        onChange={(next) => updateSetting(SettingKey.CONTEXT_BADGE_DISPLAY, next as ContextBadgeDisplay)}
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
      />
    </SettingRow>
  );
}
