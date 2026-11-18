import { SettingRow } from '../../common';
import { getAdapter } from '@/adapters';
import { useSettings } from '@/contexts/SettingsContext';
import { useTranslation } from '@/i18n';

/**
 * Opens the embedded browser's DevTools.
 *
 * An action, not a setting: there is nothing to persist, so it is a button
 * rather than a toggle. F12 used to open DevTools, which meant the chat swallowed
 * the IDE's own F12 shortcuts, Alt+F12 (the Terminal tool window in WebStorm)
 * included, with no way to turn it off, so the entry point moved here (#333).
 * A Mac now also has Cmd+Option+I, the key its browsers use for the same thing: no
 * IDE keymap binds it, so it takes nothing from the IDE (see devToolsShortcut).
 * Elsewhere this button is still the only way in.
 */
export function DevToolsRow() {
  const { t } = useTranslation('settings');
  const { ideAttached } = useSettings();

  return (
    <SettingRow
      label={t('ide.devTools.label')}
      description={ideAttached ? t('ide.devTools.description') : t('ide.devTools.unavailable')}
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
  );
}
