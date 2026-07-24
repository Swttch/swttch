import { SettingSection, SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { HostModeRow } from './HostModeRow';
import { OpenSettingsRow } from './OpenSettingsRow';
import { ChatPaginationRow } from './ChatPaginationRow';
import { UiDirectionRow } from './UiDirectionRow';
import { ClaudeConfigDirRow } from './ClaudeConfigDirRow';
import { APP_NAME } from '@/config/app';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, UiDirection } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { isRtlLanguage } from '@/i18n/languageMap';

const NOT_SET_VALUE = '__NOT_SET__';

// Interface-language options. Labels use the endonym (the language's own name)
// only, matching how the Claude Code docs present them. `value` is the stored
// setting mapped to a locale in languageMap.ts.
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

export function GeneralSettings() {
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting, scope, resetToGlobal } = useClaudeSettings();
  const { updateSettingWithScope } = useSettings();

  // Claude's response language is a free-text field in Claude's settings.json.
  // Show the value stored at the current scope (empty → English placeholder);
  // clearing the input removes the key at this scope (never overwrites on upgrade).
  const responseLanguage = (scopeSettings.language as string | undefined) ?? '';

  const rawUiLanguage = scopeSettings.uiLanguage as string | undefined;
  const isUiNotSet = rawUiLanguage === undefined && scope === 'project';
  // Interface language defaults to English when unset (does not follow the response language).
  const currentUiLanguage = isUiNotSet ? NOT_SET_VALUE : ((rawUiLanguage as string) ?? 'english');

  const useCtrlEnterToSend = (scopeSettings.useCtrlEnterToSend as boolean | undefined) ?? false;
  const focusInputOnEditorContext = (scopeSettings.focusInputOnEditorContext as boolean | undefined) ?? true;
  const respectGitignoreForContext = (scopeSettings.respectGitignoreForContext as boolean | undefined) ?? false;

  const languageOptions: SelectOption[] = [
    ...(scope === 'project'
      ? [{ value: NOT_SET_VALUE, label: t('general.language.notSet'), italic: true }]
      : []),
    ...LANGUAGE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.general')}</h2>

      <SettingSection title={APP_NAME}>
        <SettingRow
          label={t('general.language.label')}
          description={t('general.language.description')}
        >
          <input
            type="text"
            value={responseLanguage}
            onChange={(e) => updateSetting('language', e.target.value || null)}
            placeholder={t('general.language.placeholder')}
            aria-label={t('general.language.label')}
            className="w-48 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary"
          />
        </SettingRow>

        <SettingRow
          label={t('general.uiLanguage.label')}
          description={t('general.uiLanguage.description')}
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
                resetToGlobal('uiLanguage');
                return;
              }
              // Direction auto-sync fires whenever the effective direction
              // actually changes. When the previous value is NOT_SET (project
              // scope inheriting global), isRtlLanguage(undefined) already
              // resolves to false (LTR) — the same default the UI shows for
              // NOT_SET — so treating it as LTR here keeps the comparison
              // consistent instead of skipping the sync entirely.
              const previousUiLanguage = currentUiLanguage === NOT_SET_VALUE ? undefined : currentUiLanguage;
              const wasRtl = isRtlLanguage(previousUiLanguage);
              const willBeRtl = isRtlLanguage(value);
              if (willBeRtl && !wasRtl) {
                updateSettingWithScope(SettingKey.UI_DIRECTION, UiDirection.RTL, 'global');
              } else if (!willBeRtl && wasRtl) {
                updateSettingWithScope(SettingKey.UI_DIRECTION, UiDirection.LTR, 'global');
              }
              updateSetting('uiLanguage', value);
            }}
          />
        </SettingRow>

        <UiDirectionRow />

        <SettingRow
          label={t('general.useCtrlEnterToSend.label')}
          description={t('general.useCtrlEnterToSend.description')}
        >
          <ToggleSwitch
            checked={useCtrlEnterToSend}
            onChange={(checked) => updateSetting('useCtrlEnterToSend', checked)}
            ariaLabel={t('general.useCtrlEnterToSend.label')}
          />
        </SettingRow>

        <SettingRow
          label={t('general.focusInputOnEditorContext.label')}
          description={t('general.focusInputOnEditorContext.description')}
        >
          <ToggleSwitch
            checked={focusInputOnEditorContext}
            onChange={(checked) => updateSetting('focusInputOnEditorContext', checked)}
            ariaLabel={t('general.focusInputOnEditorContext.label')}
          />
        </SettingRow>

        <SettingRow
          label={t('general.respectGitignoreForContext.label')}
          description={t('general.respectGitignoreForContext.description')}
        >
          <ToggleSwitch
            checked={respectGitignoreForContext}
            onChange={(checked) => updateSetting('respectGitignoreForContext', checked)}
            ariaLabel={t('general.respectGitignoreForContext.label')}
          />
        </SettingRow>

        <HostModeRow />

        <OpenSettingsRow />

        <ChatPaginationRow />

        <ClaudeConfigDirRow />
      </SettingSection>
    </div>
  );
}
