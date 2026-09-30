import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';
import { CLAUDE_SETTINGS_DOC_HREF } from './docs';

/**
 * Whether Claude's thinking comes back as a readable summary (#496).
 *
 * Reads and writes the official `showThinkingSummaries` key, the same one a
 * terminal user sets, and nothing else. The backend turns it into the spawn
 * flag the CLI needs in `-p` mode; see resolveThinkingDisplayFlag.
 */
export function ShowThinkingSummariesRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useClaudeSettings();

  const showThinkingSummaries = (scopeSettings.showThinkingSummaries as boolean | undefined) ?? false;

  return (
    <SettingRow
      label={t('general.showThinkingSummaries.label')}
      description={t('general.showThinkingSummaries.description')}
      isOverridden={isOverridden('showThinkingSummaries')}
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref={CLAUDE_SETTINGS_DOC_HREF}
        />
      }
    >
      <ToggleSwitch
        checked={showThinkingSummaries}
        onChange={(checked) => void updateSetting('showThinkingSummaries', checked)}
        ariaLabel={t('general.showThinkingSummaries.label')}
      />
    </SettingRow>
  );
}
