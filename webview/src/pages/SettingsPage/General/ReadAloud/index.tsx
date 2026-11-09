import { useMemo } from 'react';
import { SettingSection, SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { READ_ALOUD_LANGUAGES, READ_ALOUD_SPEEDS, readAloudVoicesFor, SettingKey, type VoiceSettings } from '@/types/settings';
import { useTranslation } from '@/i18n';
import i18n from '@/i18n/config';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';
import { useReadAloudVoiceSettings } from '@/hooks/queries/useReadAloudVoiceSettings';

/** The language row's value for "read each reply in the language it is written in". */
const AUTO = '__AUTO__';

/** The voice the speech service reads in when nobody has chosen one. */
const DEFAULT_VOICE = 'buttery';

/** A language's name in the language of the interface; the code itself when the platform has no name for it. */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([i18n.language], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The speed a stored number stands for, matched to the nearest the desktop app offers. */
function speedIdOf(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'normal';
  return READ_ALOUD_SPEEDS.reduce((best, option) => (Math.abs(option.value - value) < Math.abs(best.value - value) ? option : best)).id;
}

/**
 * How replies are read aloud: the language, the voice and the speed.
 *
 * Each row shows the value that is in use. What was chosen here is that value; until something is chosen, it is what
 * the Claude account has stored (the voice and the speed) or, for the language, "auto": each reply in the language it
 * is written in. Choosing a value hands it to the reading as it is, so it wins over the account.
 */
export function ReadAloudSection() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { updateSetting } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  const voice = (displaySettings[SettingKey.VOICE] as VoiceSettings | undefined) ?? {};
  const account = useReadAloudVoiceSettings();
  // What is in use: the choice made here, else the account's, else what the reading falls back to.
  const language = voice.readAloudLanguage || account.language || AUTO;
  const voiceId = voice.readAloudVoice || account.voice || DEFAULT_VOICE;
  const speedId = speedIdOf(voice.readAloudSpeed ?? account.speed);
  // The styles on offer are those of the language in use; with Auto, the language of the interface decides.
  const styleLanguage = language === AUTO ? i18n.language : language;
  const change = (patch: Partial<VoiceSettings>) => updateSetting(SettingKey.VOICE, { ...voice, ...patch });

  const languageOptions: SelectOption[] = useMemo(
    () => [
      { value: AUTO, label: t('general.readAloud.language.auto') },
      ...READ_ALOUD_LANGUAGES.map((entry) => ({ value: entry.code, label: languageName(entry.code) })),
    ],
    [t],
  );
  const styles = readAloudVoicesFor(styleLanguage);
  const voiceOptions: SelectOption[] = [
    ...styles.map((style) => ({ value: style.id, label: style.name, previewUrl: style.previewUrl })),
    // A voice in use that the list does not hold (the account's, for another language) is shown under its own id.
    ...(styles.some((style) => style.id === voiceId) ? [] : [{ value: voiceId, label: voiceId }]),
  ];
  const speedOptions: SelectOption[] = [
    ...READ_ALOUD_SPEEDS.map((option) => ({ value: option.id, label: t(`general.readAloud.speed.${option.id}`) })),
  ];

  const selectClass = 'bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary';
  const shared = {
    isOverridden: isOverridden('voice'),
    isInherited: isInherited('voice'),
    onResetToGlobal: resetFor('voice'),
  };

  return (
    <SettingSection title={t('general.readAloud.title')} description={t('general.readAloud.description')}>
      <SettingRow label={t('general.readAloud.language.label')} description={t('general.readAloud.language.description')} {...shared}>
        <Select
          value={language}
          options={languageOptions}
          ariaLabel={t('general.readAloud.language.label')}
          searchPlaceholder={t('general.voice.speechLanguage.search')}
          noMatchLabel={t('general.voice.speechLanguage.noMatch')}
          className={selectClass}
          onChange={(value) => {
            const nextLanguage = value === AUTO ? i18n.language : value;
            const nextStyles = readAloudVoicesFor(nextLanguage);
            // A voice that belongs to another language is replaced: by the account's voice when that one is among the
            // new language's (nothing is stored then), else by the first of them, as the desktop app does.
            const keep = nextStyles.some((style) => style.id === voiceId);
            const accountFits = account.voice !== null && nextStyles.some((style) => style.id === account.voice);
            change({
              readAloudLanguage: value === AUTO || value === account.language ? null : value,
              ...(keep ? {} : { readAloudVoice: accountFits ? null : nextStyles[0].id }),
            });
          }}
        />
      </SettingRow>
      <SettingRow label={t('general.readAloud.voice.label')} description={t('general.readAloud.voice.description')} {...shared}>
        <Select
          value={voiceId}
          options={voiceOptions}
          ariaLabel={t('general.readAloud.voice.label')}
          className={selectClass}
          // Choosing what the account already has is the way back to following it: nothing is stored for it.
          onChange={(value) => change({ readAloudVoice: value === (account.voice ?? DEFAULT_VOICE) ? null : value })}
        />
      </SettingRow>
      <SettingRow label={t('general.readAloud.speed.label')} description={t('general.readAloud.speed.description')} {...shared}>
        <Select
          value={speedId}
          options={speedOptions}
          ariaLabel={t('general.readAloud.speed.label')}
          className={selectClass}
          onChange={(value) => change({ readAloudSpeed: value === speedIdOf(account.speed) ? null : (READ_ALOUD_SPEEDS.find((option) => option.id === value)?.value ?? null) })}
        />
      </SettingRow>
    </SettingSection>
  );
}
