import { SettingRow } from '../../common';
import { getAdapter } from '@/adapters';
import { useSettings } from '@/contexts/SettingsContext';
import { useTranslation } from '@/i18n';

/**
 * Opens the embedded browser's DevTools.
 *
 * An action, not a setting: there is nothing to persist, so it is a button
 * rather than a toggle. It is also the ONLY way to reach DevTools — the plugin
 * binds no key to them. F12 used to, which meant the chat swallowed the IDE's
 * own F12 shortcuts, Alt+F12 (the Terminal tool window in WebStorm) included,
 * with no way to turn it off. Moving the entry point here costs a few clicks and
 * gives the keyboard back (#333).
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
