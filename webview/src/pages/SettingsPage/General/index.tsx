import { SettingSection, SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { HostModeRow } from './HostModeRow';
import { OpenSettingsRow } from './OpenSettingsRow';
import { ChatPaginationRow } from './ChatPaginationRow';
import { UiDirectionRow } from './UiDirectionRow';
import { ClaudeConfigDirRow } from './ClaudeConfigDirRow';
import { FileSuggestionRow } from './FileSuggestionRow';
import { APP_NAME } from '@/config/app';
import { useSettings } from '@/contexts/SettingsContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { ensureSponsor } from '@/utils/ensureSponsor';
import { SettingKey, UiDirection } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { isRtlLanguage, toLocale } from '@/i18n/languageMap';
import { isMac } from '@/config/environment';

const NOT_SET_VALUE = '__NOT_SET__';
/** Voice input language sentinel: no explicit choice, follow the interface language. */
const FOLLOW_UI_VALUE = '__FOLLOW_UI__';

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
  // uiLanguage / useCtrlEnterToSend / focusInputOnEditorContext live in the app
  // settings (they are NOT in Claude's official schema). `language` and
  // `respectGitignore` ARE official keys, so they are read from and written to
  // the native Claude settings — see backend settings-migration.ts.
  const { scopeSettings, updateSetting, scope, resetToGlobal, updateSettingWithScope } = useSettings();
  const {
    scopeSettings: claudeScopeSettings,
    updateSetting: updateClaudeSetting,
  } = useClaudeSettings();

  // Claude's response language is a free-text field in Claude's own settings.json.
  // Show the value stored at the current scope (empty → English placeholder);
  // clearing the input removes the key at this scope (never overwrites on upgrade).
  const responseLanguage = (claudeScopeSettings.language as string | undefined) ?? '';

  const rawUiLanguage = scopeSettings.uiLanguage as string | undefined;
  const isUiNotSet = rawUiLanguage === undefined && scope === 'project';
  // Interface language defaults to English when unset (does not follow the response language).
  const currentUiLanguage = isUiNotSet ? NOT_SET_VALUE : ((rawUiLanguage as string) ?? 'english');

  const useCtrlEnterToSend = (scopeSettings.useCtrlEnterToSend as boolean | undefined) ?? false;
  // Label the send-modifier per platform: macOS uses Cmd (⌘), everything else Ctrl.
  // The handler accepts both (ctrlKey || metaKey); only the label needs to differ.
  const sendModifier = isMac() ? 'Cmd' : 'Ctrl';
  const focusInputOnEditorContext = (scopeSettings.focusInputOnEditorContext as boolean | undefined) ?? true;
  // Seeds the editor-context chip at the start of a session (#237). Only an
  // explicit false disables it, so `!== false` rather than the `?? true` the
  // other toggles use — anything unreadable must leave the feature on.
  const attachEditorContext = scopeSettings.attachEditorContext !== false;
  const respectGitignore = (claudeScopeSettings.respectGitignore as boolean | undefined) ?? false;
  // Auto-resume default (sponsor-only): the global default a session inherits.
  const autoResumeOnLimit = (scopeSettings.autoResumeOnLimit as boolean | undefined) ?? false;

  // Voice input stores a BCP-47 code (what the transcription service takes),
  // while the interface language stores our own value ('korean'). The options
  // are the same set of languages either way, so the labels are reused and only
  // the stored value differs.
  const sttLang = (scopeSettings.sttLang as string | undefined) ?? null;
  const sttLangOptions: SelectOption[] = [
    { value: FOLLOW_UI_VALUE, label: t('general.sttLang.followUi'), italic: true },
    ...LANGUAGE_OPTIONS.map((opt) => ({ value: toLocale(opt.value), label: opt.label })),
  ];

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
          badge={
            <SettingBadge
              variant={SettingBadgeVariant.ClaudeNative}
              docHref="https://code.claude.com/docs/en/settings#available-settings"
            />
          }
        >
          <input
            type="text"
            value={responseLanguage}
            onChange={(e) => void updateClaudeSetting('language', e.target.value || null)}
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
                resetToGlobal(SettingKey.UI_LANGUAGE);
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
              updateSetting(SettingKey.UI_LANGUAGE, value);
            }}
          />
        </SettingRow>

        <SettingRow
          label={t('general.sttLang.label')}
          description={t('general.sttLang.description')}
        >
          <Select
            value={sttLang ?? FOLLOW_UI_VALUE}
            options={sttLangOptions}
            ariaLabel={t('general.sttLang.label')}
            className={`bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
              sttLang === null ? 'text-text-tertiary' : 'text-text-primary'
            }`}
            onChange={(value) => {
              updateSetting(
                SettingKey.STT_LANG,
                value === FOLLOW_UI_VALUE ? null : value,
              );
            }}
          />
        </SettingRow>

        <UiDirectionRow />

        <SettingRow
          label={t('general.useCtrlEnterToSend.label', { modifier: sendModifier })}
          description={t('general.useCtrlEnterToSend.description')}
        >
          <ToggleSwitch
            checked={useCtrlEnterToSend}
            onChange={(checked) => updateSetting(SettingKey.USE_CTRL_ENTER_TO_SEND, checked)}
            ariaLabel={t('general.useCtrlEnterToSend.label', { modifier: sendModifier })}
          />
        </SettingRow>

        <SettingRow
          label={t('general.attachEditorContext.label')}
          description={t('general.attachEditorContext.description')}
        >
          <ToggleSwitch
            checked={attachEditorContext}
            onChange={(checked) => updateSetting(SettingKey.ATTACH_EDITOR_CONTEXT, checked)}
            ariaLabel={t('general.attachEditorContext.label')}
          />
        </SettingRow>

        <SettingRow
          label={t('general.focusInputOnEditorContext.label')}
          description={t('general.focusInputOnEditorContext.description')}
        >
          <ToggleSwitch
            checked={focusInputOnEditorContext}
            onChange={(checked) => updateSetting(SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT, checked)}
            ariaLabel={t('general.focusInputOnEditorContext.label')}
          />
        </SettingRow>

        <SettingRow
          label={t('general.respectGitignore.label')}
          description={t('general.respectGitignore.description')}
          badge={
            <SettingBadge
              variant={SettingBadgeVariant.ClaudeNative}
              docHref="https://code.claude.com/docs/en/settings#available-settings"
            />
          }
        >
          <ToggleSwitch
            checked={respectGitignore}
            onChange={(checked) => void updateClaudeSetting('respectGitignore', checked)}
            ariaLabel={t('general.respectGitignore.label')}
          />
        </SettingRow>

        <SettingRow
          label={t('general.autoResumeOnLimit.label')}
          description={t('general.autoResumeOnLimit.description')}
          badge={<SettingBadge variant={SettingBadgeVariant.Sponsor} />}
        >
          <ToggleSwitch
            checked={autoResumeOnLimit}
            onChange={async (checked) => {
              if (await ensureSponsor()) {
                updateSetting(SettingKey.AUTO_RESUME_ON_LIMIT, checked);
              }
            }}
            ariaLabel={t('general.autoResumeOnLimit.label')}
          />
        </SettingRow>

        <FileSuggestionRow />

        <HostModeRow />

        <OpenSettingsRow />

        <ChatPaginationRow />

        <ClaudeConfigDirRow />
      </SettingSection>
    </div>
  );
}
