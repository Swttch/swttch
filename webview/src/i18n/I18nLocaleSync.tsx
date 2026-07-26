import { useEffect } from 'react';
import i18n from './config';
import { toLocale } from './languageMap';
import { useSettings } from '@/contexts/SettingsContext';

/**
 * localStorage cache of the last-known `uiLanguage`, written on every sync so
 * the FOUC bootstrap (webview/index.html inline <script> + bootstrapTheme.ts's
 * resolveBootstrapLang) can set `<html lang>` correctly before the bridge
 * connects and this component's effect runs — the same fast-path pattern
 * SettingsContext uses for `uiDirection` (STORAGE_KEY 'claude-code-settings').
 * SettingsContext (which owns uiLanguage) has no such cache itself, so
 * this is a narrow, dedicated one just for the boot-time `lang` hint.
 */
export const UI_LANGUAGE_STORAGE_KEY = 'claude-code-ui-language';

/**
 * Keeps the active UI locale in sync with the "Interface Language" setting
 * (Settings → General → Interface Language), which is independent from
 * `language` (Claude's response language). Also mirrors it onto `<html lang>`
 * for screen readers (an incorrect `lang` mispronounces/misprocesses the UI
 * text, independent of the `dir` mirroring bug). Renders nothing.
 *
 * Source of truth is `settings.uiLanguage`. When it is unset the UI defaults
 * to English (toLocale falls back to DEFAULT_LOCALE) — it does NOT follow the
 * response language.
 */
export function I18nLocaleSync() {
  const { settings } = useSettings();
  const uiLanguage = settings.uiLanguage ?? undefined;

  useEffect(() => {
    const locale = toLocale(uiLanguage);
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale);
    }
    if (document.documentElement.lang !== locale) {
      document.documentElement.setAttribute('lang', locale);
    }
    try {
      if (uiLanguage) {
        localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, uiLanguage);
      } else {
        localStorage.removeItem(UI_LANGUAGE_STORAGE_KEY);
      }
    } catch {
      /* ignore localStorage write error */
    }
  }, [uiLanguage]);

  return null;
}
