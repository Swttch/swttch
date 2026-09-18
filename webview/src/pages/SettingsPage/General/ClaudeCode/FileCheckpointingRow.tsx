import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/** Whether Claude snapshots a file before editing it, so a rewind can restore it. */
export function FileCheckpointingRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useClaudeSettings();

  // Claude's schema defaults this one to `true`, unlike the toggles around it —
  // an absent value means the feature is ON, so the fallback has to say so.
  const fileCheckpointingEnabled =
    (scopeSettings.fileCheckpointingEnabled as boolean | undefined) ?? true;

  return (
    <SettingRow
      label={t('general.fileCheckpointing.label')}
      description={t('general.fileCheckpointing.description')}
      isOverridden={isOverridden('fileCheckpointingEnabled')}
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref="https://code.claude.com/docs/en/checkpointing"
        />
      }
    >
      <ToggleSwitch
        checked={fileCheckpointingEnabled}
        onChange={(checked) => void updateSetting('fileCheckpointingEnabled', checked)}
        ariaLabel={t('general.fileCheckpointing.label')}
      />
    </SettingRow>
  );
}
