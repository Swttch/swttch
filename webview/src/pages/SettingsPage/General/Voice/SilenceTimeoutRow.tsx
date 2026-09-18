import { SettingRow } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import {
  SettingKey,
  VOICE_SILENCE_TIMEOUT_DEFAULT,
  VOICE_SILENCE_TIMEOUT_MIN,
  VOICE_SILENCE_TIMEOUT_MAX,
  clampVoiceSilenceTimeout,
  type VoiceSettings,
} from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/** How long a recording waits through silence before it stops on its own. */
export function SilenceTimeoutRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useSettings();

  const voice = (scopeSettings[SettingKey.VOICE] as VoiceSettings | undefined) ?? {};
  const silenceTimeout = voice.silenceTimeout ?? VOICE_SILENCE_TIMEOUT_DEFAULT;

  return (
    <SettingRow
      label={t('general.voice.silenceTimeout.label')}
      description={t('general.voice.silenceTimeout.description', {
        max: VOICE_SILENCE_TIMEOUT_MAX,
      })}
      isOverridden={isOverridden('voice')}
    >
      <input
        type="number"
        min={VOICE_SILENCE_TIMEOUT_MIN}
        max={VOICE_SILENCE_TIMEOUT_MAX}
        step="1"
        value={silenceTimeout}
        aria-label={t('general.voice.silenceTimeout.label')}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          if (!Number.isInteger(parsed)) return;
          updateSetting(SettingKey.VOICE, {
            ...voice,
            // Clamped on the way in: the service stops listening after 15s of
            // silence regardless, so neither a longer wait nor "never" is
            // something we could actually honour.
            silenceTimeout: clampVoiceSilenceTimeout(parsed),
          });
        }}
        className="min-w-32 max-w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
      />
    </SettingRow>
  );
}
