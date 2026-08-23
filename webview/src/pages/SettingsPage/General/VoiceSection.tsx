import { useMemo } from 'react';
import { SettingSection, SettingRow, DiffersFromOfficialHint } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useExtendKit } from '@/hooks/queries/useExtendKit';
import { ExtendKitControl } from './ExtendKitControl';
import { ShortcutInput } from './ShortcutInput';
import { useSettings } from '@/contexts/SettingsContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import {
  SettingKey,
  VOICE_SILENCE_TIMEOUT_DEFAULT,
  VOICE_SILENCE_TIMEOUT_MIN,
  VOICE_SILENCE_TIMEOUT_MAX,
  VOICE_SHORTCUT_DEFAULT,
  clampVoiceSilenceTimeout,
  type VoiceSettings,
} from '@/types/settings';
import { useTranslation } from '@/i18n';
import i18n from '@/i18n/config';
import { useIsOverriddenByProject } from '@/utils/settingsScope';
import {
  listDictationLanguages,
  languageSettingToCode,
  isDictationSupported,
} from '@/i18n/dictationLanguage';

/** Stored as "no explicit choice": follow Claude's language, then the interface. */
const FOLLOW_VALUE = '__FOLLOW__';

/**
 * Voice input settings.
 *
 * Its own section rather than more rows under the app settings: these only
 * apply while dictating, and one of them (the language) is easy to confuse with
 * the two language settings above it if they sit in the same list.
 */
export function VoiceSection() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useSettings();
  const { scopeSettings: claudeScopeSettings, updateSetting: updateClaudeSetting } =
    useClaudeSettings();

  // Claude's own voice object. Spread on write so `mode` and `autoSubmit` —
  // which belong to the CLI's key handling and mean nothing here — survive
  // untouched rather than being dropped by our update.
  const claudeVoice = (claudeScopeSettings.voice as Record<string, unknown> | undefined) ?? {};
  // Absent means on for us, unlike the CLI: see the note in ChatInput.
  const voiceEnabled = claudeVoice.enabled !== false;

  const voice = (scopeSettings[SettingKey.VOICE] as VoiceSettings | undefined) ?? {};
  const speechLanguage = voice.speechLanguage ?? null;
  const silenceTimeout = voice.silenceTimeout ?? VOICE_SILENCE_TIMEOUT_DEFAULT;

  // What "follow" currently resolves to, so the placeholder can name it instead
  // of leaving the user to guess which language they would get.
  const inherited =
    languageSettingToCode(claudeScopeSettings.language as string | undefined) ?? i18n.language;

  const languageOptions: SelectOption[] = useMemo(() => {
    const all = listDictationLanguages(i18n.language);
    const inheritedLabel = all.find((o) => o.code === inherited)?.label ?? inherited;
    return [
      {
        value: FOLLOW_VALUE,
        label: t('general.voice.speechLanguage.follow', { language: inheritedLabel }),
        italic: true,
      },
      ...all.map((o) => ({
        value: o.code,
        // The unsupported ones stay selectable but say so: the service
        // transcribes them as English, and finding that out by speaking is
        // worse than reading it here.
        label: o.supported ? o.label : t('general.voice.speechLanguage.unsupported', { language: o.label }),
      })),
    ];
  }, [t, inherited]);

  const showsFallbackWarning = Boolean(speechLanguage) && !isDictationSupported(speechLanguage);

  // Voice input cannot run without the kit, so its settings are inert until it
  // is there. Showing them live would let the user configure something that
  // does nothing and looks broken.
  //
  // The on/off toggle is exempt (see below): it is the one control that means
  // something without the kit, and locking it would strand anyone who turned
  // voice input off — including from the first-use question, whose whole promise
  // is that this screen can turn it back on.
  const { info } = useExtendKit();
  const kitMissing = Boolean(info) && !info?.installed;

  return (
    <SettingSection
      title={t('general.voice.title')}
      titleAction={<ExtendKitControl />}
      description={kitMissing ? t('general.voice.kit.required') : undefined}
    >
      <SettingRow
        label={t('general.voice.enabled.label')}
        description={t('general.voice.enabled.description')}
        isOverridden={isOverridden('voice')}
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
            // Written to Claude's own settings, not ours: this is the same key
            // `/voice` toggles, so turning it off here turns it off there.
            void updateClaudeSetting('voice', { ...claudeVoice, enabled: checked });
          }}
        />
      </SettingRow>

      {/* Everything below only applies while voice input is on AND the kit is
          installed. Dimmed rather than hidden so it is clear the settings still
          exist, and so the rows do not jump around as the toggle is flipped.

          The toggle above stays live in both cases — it is the way back, and a
          user who turned voice input off must not need the kit installed to turn
          it on again. */}
      <div
        className={voiceEnabled && !kitMissing ? '' : 'opacity-50 pointer-events-none select-none'}
        aria-disabled={!voiceEnabled || kitMissing || undefined}
      >
      <SettingRow
        label={t('general.voice.speechLanguage.label')}
        isOverridden={isOverridden('voice')}
        description={
          <>
            {showsFallbackWarning
              ? t('general.voice.speechLanguage.fallbackWarning')
              : t('general.voice.speechLanguage.description')}
            <DiffersFromOfficialHint
              title={t('general.voice.speechLanguage.differsTitle')}
              body={t('general.voice.speechLanguage.differsBody')}
            />
          </>
        }
      >
        <Select
          value={speechLanguage ?? FOLLOW_VALUE}
          options={languageOptions}
          ariaLabel={t('general.voice.speechLanguage.label')}
          searchPlaceholder={t('general.voice.speechLanguage.search')}
          noMatchLabel={t('general.voice.speechLanguage.noMatch')}
          className={`w-56 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
            speechLanguage === null ? 'text-text-tertiary' : 'text-text-primary'
          }`}
          onChange={(value) => {
            updateSetting(SettingKey.VOICE, {
              ...voice,
              speechLanguage: value === FOLLOW_VALUE ? null : value,
            });
          }}
        />
      </SettingRow>

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
          className="w-24 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
        />
      </SettingRow>

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
      </div>
    </SettingSection>
  );
}
