import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, UiDirection } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { isRtlLanguage } from '@/i18n/languageMap';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

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
  const { scopeSettings, updateSetting, scope, resetToGlobal, updateSettingWithScope } =
    useSettings();

  const rawUiLanguage = scopeSettings.uiLanguage as string | undefined;
  const isUiNotSet = rawUiLanguage === undefined && scope === 'project';
  // Defaults to English when unset.
  const currentUiLanguage = isUiNotSet ? NOT_SET_VALUE : ((rawUiLanguage as string) ?? 'english');

  const languageOptions: SelectOption[] = [
    ...(scope === 'project'
      ? [{ value: NOT_SET_VALUE, label: t('general.language.notSet'), italic: true }]
      : []),
    ...LANGUAGE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
  ];

  return (
    <SettingRow
      label={t('general.uiLanguage.label')}
      description={t('general.uiLanguage.description')}
      isOverridden={isOverridden(SettingKey.UI_LANGUAGE)}
    >
      <Select
        value={currentUiLanguage}
        options={languageOptions}
        ariaLabel={t('general.uiLanguage.label')}
        className={`bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
          isUiNotSet ? 'text-text-tertiary' : 'text-text-primary'
        }`}
        onChange={(value) => {
          if (value === NOT_SET_VALUE) {
            resetToGlobal(SettingKey.UI_LANGUAGE);
            return;
          }
          // Direction auto-sync fires whenever the effective direction actually
          // changes. When the previous value is NOT_SET (project scope
          // inheriting global), isRtlLanguage(undefined) already resolves to
          // false (LTR) — the same default the UI shows for NOT_SET — so
          // treating it as LTR here keeps the comparison consistent instead of
          // skipping the sync entirely.
          const previousUiLanguage = currentUiLanguage === NOT_SET_VALUE ? undefined : currentUiLanguage;
          const wasRtl = isRtlLanguage(previousUiLanguage);
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
