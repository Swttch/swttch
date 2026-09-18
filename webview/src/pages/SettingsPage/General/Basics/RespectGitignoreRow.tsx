import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';
import { CLAUDE_SETTINGS_DOC_HREF } from './docs';

/** Whether a gitignored file's contents are kept out of the editor context. */
export function RespectGitignoreRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useClaudeSettings();

  const respectGitignore = (scopeSettings.respectGitignore as boolean | undefined) ?? false;

  return (
    <SettingRow
      label={t('general.respectGitignore.label')}
      description={t('general.respectGitignore.description')}
      isOverridden={isOverridden('respectGitignore')}
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref={CLAUDE_SETTINGS_DOC_HREF}
        />
      }
    >
      <ToggleSwitch
        checked={respectGitignore}
        onChange={(checked) => void updateSetting('respectGitignore', checked)}
        ariaLabel={t('general.respectGitignore.label')}
      />
    </SettingRow>
  );
}
