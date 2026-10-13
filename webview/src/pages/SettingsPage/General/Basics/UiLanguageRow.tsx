import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, UiDirection } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { isRtlLanguage } from '@/i18n/languageMap';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/** The value standing for "this project says nothing; follow the global one". */
const NOT_SET_VALUE = '__NOT_SET__';

// Labels use the endonym (the language's own name) only, matching how the
// Claude Code docs present them. `value` is the stored setting, mapped to a
// locale in languageMap.ts.
const LANGUAGE_OPTIONS = [
  { value: 'english', label: 'English' },
  { value: 'korean', label: '한국어' },
  { value: 'japanese', label: '日本語' },
  { value: 'chinese', label: '简体中文' },
  { value: 'chinese-traditional', label: '繁體中文' },
  { value: 'spanish', label: 'Español' },
  { value: 'french', label: 'Français' },
  { value: 'german', label: 'Deutsch' },
  { value: 'portuguese', label: 'Português' },
  { value: 'russian', label: 'Русский' },
  { value: 'persian', label: 'فارسی' },
  { value: 'arabic', label: 'العربية' },
] as const;

/**
 * The language the app's own interface is written in.
 *
 * Separate from the language Claude answers in, and it does not follow it:
 * reading the UI in one language while asking for answers in another is a
 * normal thing to want.
 */
export function UiLanguageRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { updateSetting, scope, resetToGlobal, updateSettingWithScope } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  // Defaults to English when neither the project nor global sets one.
  const currentUiLanguage = (displaySettings.uiLanguage as string | undefined) ?? 'english';
  const inherited = isInherited(SettingKey.UI_LANGUAGE);
  // Offered only while the project has its own value to take back; see LogLevelRow.
  const hasOwnValue = scope === 'project' && !inherited;

  const languageOptions: SelectOption[] = [
    ...(hasOwnValue
      ? [{ value: NOT_SET_VALUE, label: t('general.language.notSet'), italic: true }]
      : []),
    ...LANGUAGE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
  ];

  return (
    <SettingRow
      label={t('general.uiLanguage.label')}
      description={t('general.uiLanguage.description')}
      isOverridden={isOverridden(SettingKey.UI_LANGUAGE)}
      isInherited={inherited}
      onResetToGlobal={resetFor(SettingKey.UI_LANGUAGE)}
    >
      <Select
        value={currentUiLanguage}
        options={languageOptions}
        ariaLabel={t('general.uiLanguage.label')}
        className={`bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
          inherited ? 'text-text-tertiary' : 'text-text-primary'
        }`}
        onChange={(value) => {
          if (value === NOT_SET_VALUE) {
            resetToGlobal(SettingKey.UI_LANGUAGE);
            return;
          }
          // Direction auto-sync fires whenever the effective direction actually
          // changes, so the comparison is against the language in effect now,
          // inherited or not.
          const wasRtl = isRtlLanguage(currentUiLanguage);
          const willBeRtl = isRtlLanguage(value);
          if (willBeRtl && !wasRtl) {
            updateSettingWithScope(SettingKey.UI_DIRECTION, UiDirection.RTL, 'global');
          } else if (!willBeRtl && wasRtl) {
            updateSettingWithScope(SettingKey.UI_DIRECTION, UiDirection.LTR, 'global');
          }
          updateSetting(SettingKey.UI_LANGUAGE, value);
        }}
      />
    </SettingRow>
  );
}
