import { HelpHint, SettingRow } from '../../common';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, TRANSCRIPT_VIEW_MODES, type TranscriptViewMode } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/** The "Switch view modes" section of the Claude Desktop docs, which the badge opens. */
const CLAUDE_DESKTOP_VIEW_MODES_DOC_HREF = 'https://code.claude.com/docs/en/desktop#switch-view-modes';

/** The select has no way to hold `null`, so the classic chat is this value in it. */
const CLASSIC = 'classic';

/**
 * Chooses how the chat is drawn: the chat UI released so far ("Classic", stored as
 * `null`), or one of the Claude desktop app's Transcript views. Every view but
 * Classic puts the user's bubble on the right and drops its fold arrow and its
 * pinning to the top. The names and the order of the three views are the desktop
 * app's own.
 */
export function TranscriptViewModeRow() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { updateSetting } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  const mode = displaySettings[SettingKey.TRANSCRIPT_VIEW_MODE] ?? 'normal';
  const options: SelectOption[] = [
    { value: CLASSIC, label: t('appearance.transcriptViewMode.classic') },
    ...TRANSCRIPT_VIEW_MODES.map((value) => ({ value, label: t(`appearance.transcriptViewMode.${value}`) })),
  ];

  return (
    <SettingRow
      label={t('appearance.transcriptViewMode.label')}
      description={t('appearance.transcriptViewMode.description')}
      labelSuffix={
        <HelpHint
          title={t('appearance.transcriptViewMode.hint.title')}
          body={t('appearance.transcriptViewMode.hint.body')}
        />
      }
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref={CLAUDE_DESKTOP_VIEW_MODES_DOC_HREF}
          // Not a settings.json key the CLI shares, so the badge's usual "Claude Code native setting" would be untrue here.
          tooltipOverride={t('appearance.transcriptViewMode.badge')}
        />
      }
      isOverridden={isOverridden(SettingKey.TRANSCRIPT_VIEW_MODE)}
      isInherited={isInherited(SettingKey.TRANSCRIPT_VIEW_MODE)}
      onResetToGlobal={resetFor(SettingKey.TRANSCRIPT_VIEW_MODE)}
    >
      <Select
        value={mode}
        options={options}
        ariaLabel={t('appearance.transcriptViewMode.label')}
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
        onChange={(value) =>
          updateSetting(SettingKey.TRANSCRIPT_VIEW_MODE, value as TranscriptViewMode | typeof CLASSIC)
        }
      />
    </SettingRow>
  );
}
