import { SettingSection, SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { HostModeRow } from './HostModeRow';
import { OpenSettingsRow } from './OpenSettingsRow';
import { ChatPaginationRow } from './ChatPaginationRow';
import { UiDirectionRow } from './UiDirectionRow';
import { ClaudeConfigDirRow } from './ClaudeConfigDirRow';
import { FileSuggestionRow } from './FileSuggestionRow';
import { VoiceSection } from './VoiceSection';
import { APP_NAME } from '@/config/app';
import { useSettings } from '@/contexts/SettingsContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { ensureSponsor } from '@/utils/ensureSponsor';
import { SettingKey, UiDirection } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { isRtlLanguage } from '@/i18n/languageMap';
import { isMac } from '@/config/environment';

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
  const respectGitignore = (claudeScopeSettings.respectGitignore as boolean | undefined) ?? false;
  // Auto-resume default (sponsor-only): the global default a session inherits.
  const autoResumeOnLimit = (scopeSettings.autoResumeOnLimit as boolean | undefined) ?? false;

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

      <VoiceSection />
    </div>
  );
}
