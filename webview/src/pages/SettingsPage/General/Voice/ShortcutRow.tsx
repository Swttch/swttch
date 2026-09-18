import { SettingRow, ShortcutInput } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, VOICE_SHORTCUT_DEFAULT, type VoiceSettings } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * The key that starts and stops recording.
 *
 * Deliberately not offered `allowShiftAlone`: this shortcut listens on the whole
 * window, so a Shift+Enter bound here would eat the composer's line break from
 * a screen that never mentions the composer.
 */
export function ShortcutRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useSettings();

  const voice = (scopeSettings[SettingKey.VOICE] as VoiceSettings | undefined) ?? {};

  return (
    <SettingRow
      label={t('general.voice.shortcut.label')}
      description={t('general.voice.shortcut.description')}
      isOverridden={isOverridden('voice')}
    >
      <ShortcutInput
        value={voice.shortcut ?? VOICE_SHORTCUT_DEFAULT}
        ariaLabel={t('general.voice.shortcut.label')}
        onChange={(shortcut) => {
          updateSetting(SettingKey.VOICE, { ...voice, shortcut });
        }}
      />
    </SettingRow>
  );
}
