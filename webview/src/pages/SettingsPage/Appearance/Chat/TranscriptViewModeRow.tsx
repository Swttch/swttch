import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, TRANSCRIPT_VIEW_MODES, type TranscriptViewMode } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

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

  const mode = displaySettings[SettingKey.TRANSCRIPT_VIEW_MODE] ?? null;
  const options: SelectOption[] = [
    { value: CLASSIC, label: t('appearance.transcriptViewMode.classic') },
    ...TRANSCRIPT_VIEW_MODES.map((value) => ({ value, label: t(`appearance.transcriptViewMode.${value}`) })),
  ];

  return (
    <SettingRow
      label={t('appearance.transcriptViewMode.label')}
      description={t('appearance.transcriptViewMode.description')}
      isOverridden={isOverridden(SettingKey.TRANSCRIPT_VIEW_MODE)}
      isInherited={isInherited(SettingKey.TRANSCRIPT_VIEW_MODE)}
      onResetToGlobal={resetFor(SettingKey.TRANSCRIPT_VIEW_MODE)}
    >
      <Select
        value={mode ?? CLASSIC}
        options={options}
        ariaLabel={t('appearance.transcriptViewMode.label')}
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
        onChange={(value) =>
          updateSetting(SettingKey.TRANSCRIPT_VIEW_MODE, value === CLASSIC ? null : (value as TranscriptViewMode))
        }
      />
    </SettingRow>
  );
}
