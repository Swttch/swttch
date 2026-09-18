import { SettingSection } from '../../common';
import { ExtendKitControl } from './ExtendKitControl';
import { EnabledRow, useVoiceEnabled } from './EnabledRow';
import { SpokenLanguageRow } from './SpokenLanguageRow';
import { SilenceTimeoutRow } from './SilenceTimeoutRow';
import { ShortcutRow } from './ShortcutRow';
import { useVoiceAvailability } from './useVoiceAvailability';
import { useTranslation } from '@/i18n';

/**
 * Voice input settings.
 *
 * Its own section rather than more rows under the app settings: these only
 * apply while dictating, and one of them (the spoken language) is easy to
 * confuse with the two language settings above it if they sit in the same list.
 */
export function VoiceSection() {
  const { t } = useTranslation('settings');
  const voiceEnabled = useVoiceEnabled();
  const { kitMissing, notLoggedIn, blocked } = useVoiceAvailability();

  return (
    <SettingSection
      title={t('general.voice.title')}
      titleAction={<ExtendKitControl />}
      description={
        kitMissing
          ? t('general.voice.kit.required')
          : notLoggedIn
            ? t('general.voice.login.required')
            : undefined
      }
    >
      <EnabledRow />

      {/* Everything below only applies while voice input is on AND it has what
          it needs to run. Dimmed rather than hidden so it is clear the settings
          still exist, and so the rows do not jump around as the toggle is
          flipped.

          The toggle above stays live in both cases — it is the way back, and a
          user who turned voice input off must not need an install to turn it on
          again. */}
      <div
        className={voiceEnabled && !blocked ? '' : 'opacity-50 pointer-events-none select-none'}
        aria-disabled={!voiceEnabled || blocked || undefined}
      >
        <SpokenLanguageRow />
        <SilenceTimeoutRow />
        <ShortcutRow />
      </div>
    </SettingSection>
  );
}
