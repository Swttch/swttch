import { SettingSection, SettingRow } from '../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { getAdapter } from '@/adapters';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

interface Props {
  className?: string;
}

/**
 * Settings that only mean anything when an IDE is hosting the backend.
 *
 * The section is ALWAYS listed, even with no IDE attached: the editor-context
 * options below have been settable from a browser since long before this
 * section existed, and hiding the section would take that away from standalone
 * users.
 *
 * Choosing where a proposed edit is reviewed does NOT live here: it is one half
 * of a question whose other half (how the built-in diff appears) has nothing to
 * do with an IDE, and splitting the pair across two screens would hide that the
 * first answer decides whether the second applies. Both are in General.
 *
 * The DevTools row is an action, not a setting: there is nothing to persist, so
 * it is a button rather than a toggle. It is also the ONLY way to reach the
 * embedded browser's DevTools — the plugin binds no key to them. F12 used to,
 * which meant the chat swallowed the IDE's own F12 shortcuts, Alt+F12 (the
 * Terminal tool window in WebStorm) included, with no way to turn it off. Moving
 * the entry point here costs a few clicks and gives the keyboard back (#333).
 */
export const IdeSettings = (props: Props) => {
  const { className = '' } = props;
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting, ideAttached } = useSettings();
  const isOverridden = useIsOverriddenByProject();

  // Seeds the editor-context chip at the start of a session (#237). Only an
  // explicit false disables it, so `!== false` rather than the `?? true` the
  // other toggles use — anything unreadable must leave the feature on.
  const attachEditorContext = scopeSettings[SettingKey.ATTACH_EDITOR_CONTEXT] !== false;
  const focusInputOnEditorContext = scopeSettings[SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT] ?? true;

  return (
    <div className={className}>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.ide')}</h2>

      <SettingSection title={t('ide.sectionTitle')}>
        <SettingRow
          label={t('ide.attachEditorContext.label')}
          description={t('ide.attachEditorContext.description')}
          isOverridden={isOverridden(SettingKey.ATTACH_EDITOR_CONTEXT)}
        >
          <ToggleSwitch
            checked={attachEditorContext}
            onChange={(checked) => updateSetting(SettingKey.ATTACH_EDITOR_CONTEXT, checked)}
            ariaLabel={t('ide.attachEditorContext.label')}
          />
        </SettingRow>

        <SettingRow
          label={t('ide.focusInputOnEditorContext.label')}
          description={t('ide.focusInputOnEditorContext.description')}
          isOverridden={isOverridden(SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT)}
        >
          <ToggleSwitch
            checked={focusInputOnEditorContext}
            onChange={(checked) => updateSetting(SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT, checked)}
            ariaLabel={t('ide.focusInputOnEditorContext.label')}
          />
        </SettingRow>

        <SettingRow
          label={t('ide.devTools.label')}
          description={
            ideAttached ? t('ide.devTools.description') : t('ide.devTools.unavailable')
          }
        >
          <button
            type="button"
            aria-label={t('ide.devTools.label')}
            disabled={!ideAttached}
            onClick={() => {
              void getAdapter().openDevTools();
            }}
            className="rounded-lg border border-border-default bg-surface-overlay px-3 py-1.5 text-sm text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-overlay"
          >
            {t('ide.devTools.action')}
          </button>
        </SettingRow>
      </SettingSection>
    </div>
  );
};
