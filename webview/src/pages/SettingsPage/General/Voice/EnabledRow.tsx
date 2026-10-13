import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useTranslation } from '@/i18n';
import { useClaudeDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether voice input exists at all: the microphone button and its shortcut.
 *
 * Written to Claude's own settings rather than ours, because this is the same
 * key `/voice` toggles — turning it off here turns it off there.
 *
 * Stays live even when the kit is missing or the login is not there, unlike the
 * rows under it. It is the way back for anyone who turned voice input off, and
 * needing an install to undo that would be a trap.
 */
export function EnabledRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useClaudeSettings();
  const { displaySettings, isInherited, resetFor } = useClaudeDisplaySettings();

  // What is drawn is the value in effect, which on the project tab can come from
  // the global file. What is written spreads the tab's own object instead: the
  // CLI merges its settings key by key, so copying the global sub-keys into the
  // project would freeze them there.
  //
  // Spread on write so `mode` and `autoSubmit` — which belong to the CLI's key
  // handling and mean nothing here — survive untouched rather than being
  // dropped by our update.
  const ownVoice = (scopeSettings.voice as Record<string, unknown> | undefined) ?? {};
  const claudeVoice = (displaySettings.voice as Record<string, unknown> | undefined) ?? {};
  // Absent means on for us, unlike the CLI: see the note in ChatInput.
  const voiceEnabled = claudeVoice.enabled !== false;

  return (
    <SettingRow
      label={t('general.voice.enabled.label')}
      description={t('general.voice.enabled.description')}
      isOverridden={isOverridden('voice')}
      isInherited={isInherited('voice')}
      onResetToGlobal={resetFor('voice')}
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref="https://code.claude.com/docs/en/voice-dictation"
        />
      }
    >
      <ToggleSwitch
        checked={voiceEnabled}
        ariaLabel={t('general.voice.enabled.label')}
        onChange={(checked) => {
          void updateSetting('voice', { ...ownVoice, enabled: checked });
        }}
      />
    </SettingRow>
  );
}

/** Whether voice input is on, for the section deciding what to dim. */
export function useVoiceEnabled(): boolean {
  const { displaySettings } = useClaudeDisplaySettings();
  const claudeVoice = (displaySettings.voice as Record<string, unknown> | undefined) ?? {};
  return claudeVoice.enabled !== false;
}
