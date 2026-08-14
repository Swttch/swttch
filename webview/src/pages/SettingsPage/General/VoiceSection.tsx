import { useMemo } from 'react';
import { SettingSection, SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { useExtendKit } from '@/hooks/queries/useExtendKit';
import { ExtendKitControl } from './ExtendKitControl';
import { useSettings } from '@/contexts/SettingsContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { SettingKey, type VoiceSettings } from '@/types/settings';
import { useTranslation } from '@/i18n';
import i18n from '@/i18n/config';
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
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useSettings();
  const { scopeSettings: claudeScopeSettings } = useClaudeSettings();

  const voice = (scopeSettings[SettingKey.VOICE] as VoiceSettings | undefined) ?? {};
  const speechLanguage = voice.speechLanguage ?? null;

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
  const { info } = useExtendKit();
  const kitMissing = Boolean(info) && !info?.installed;

  return (
    <SettingSection
      title={t('general.voice.title')}
      titleAction={<ExtendKitControl />}
      disabled={kitMissing}
      description={kitMissing ? t('general.voice.kit.required') : undefined}
    >
      <SettingRow
        label={t('general.voice.speechLanguage.label')}
        description={
          showsFallbackWarning
            ? t('general.voice.speechLanguage.fallbackWarning')
            : t('general.voice.speechLanguage.description')
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
    </SettingSection>
  );
}
