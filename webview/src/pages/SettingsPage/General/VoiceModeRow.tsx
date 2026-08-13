import { SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, VoiceMode } from '@/types/settings';
import { useTranslation } from '@/i18n';

/**
 * Lets the user choose how the mic button starts and stops dictation: hold the
 * button down to talk (default, best for a quick sentence) or tap once to start
 * and again to stop (better for dictating something long). App-global
 * behaviour, so always written to the global scope.
 */
export function VoiceModeRow() {
  const { settings, updateSettingWithScope } = useSettings();
  const { t } = useTranslation('settings');

  // Optional chaining rather than a bare index: settings is not yet populated
  // on the first render after a cold open, and a row that throws takes the
  // whole settings screen down with it.
  const mode = settings?.[SettingKey.VOICE_MODE] ?? VoiceMode.HOLD;

  const voiceModeOptions: SelectOption[] = [
    { value: VoiceMode.HOLD, label: t('general.voiceMode.hold') },
    { value: VoiceMode.TAP, label: t('general.voiceMode.tap') },
  ];

  return (
    <SettingRow
      label={t('general.voiceMode.label')}
      description={t('general.voiceMode.description')}
    >
      <Select
        value={mode}
        options={voiceModeOptions}
        ariaLabel={t('general.voiceMode.label')}
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
        onChange={(value) => updateSettingWithScope(SettingKey.VOICE_MODE, value as VoiceMode, 'global')}
      />
    </SettingRow>
  );
}
