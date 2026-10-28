import { HelpHint, SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useTranslation } from '@/i18n';
import { useClaudeDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether the CLI offers Artifacts (the Artifact tool and `/slides`) to Claude's sessions.
 *
 * The official `enableArtifact` key only ever switches them OFF: `false` removes the tool and
 * no other file can turn it back on, while `true` or an absent key leaves the CLI's own
 * decision untouched. That is why an absent value reads as ON here, the same fallback the
 * checkpointing row uses, and why the backend keeps passing its own variable for the headless
 * spawn (#584) unless this is `false` (#609).
 */
export function ArtifactsRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { updateSetting } = useClaudeSettings();
  const { displaySettings, isInherited, resetFor } = useClaudeDisplaySettings();

  const enableArtifact = (displaySettings.enableArtifact as boolean | undefined) ?? true;

  return (
    <SettingRow
      label={t('general.artifacts.label')}
      description={t('general.artifacts.description')}
      labelSuffix={<HelpHint title={t('general.artifacts.hint.title')} body={t('general.artifacts.hint.body')} />}
      isOverridden={isOverridden('enableArtifact')}
      isInherited={isInherited('enableArtifact')}
      onResetToGlobal={resetFor('enableArtifact')}
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref="https://code.claude.com/docs/en/artifacts#disable-artifacts"
        />
      }
    >
      <ToggleSwitch
        checked={enableArtifact}
        onChange={(checked) => void updateSetting('enableArtifact', checked)}
        ariaLabel={t('general.artifacts.label')}
      />
    </SettingRow>
  );
}
