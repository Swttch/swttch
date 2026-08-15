// Bridge between the stored "Interface Language" setting value
// (Settings → General → Interface Language, e.g. 'english', 'korean') and the
// BCP-47 locale code used by i18next for the UI (e.g. 'en', 'ko'). This is the
// single, explicit place that translates one into the other.
// Keep the keys in sync with LANGUAGE_OPTIONS in
// pages/SettingsPage/General/index.tsx.
//
// Chinese is split into Simplified ('chinese' → 'zh') and Traditional
// ('chinese-traditional' → 'zh-TW'), matching how Chinese locales are
// conventionally separated.

export const SUPPORTED_LOCALES = ['en', 'ko', 'ja', 'zh', 'zh-TW', 'es', 'fr', 'de', 'pt', 'ru', 'fa', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LANGUAGE_TO_LOCALE: Record<string, Locale> = {
  english: 'en',
  korean: 'ko',
  japanese: 'ja',
  chinese: 'zh',
  'chinese-traditional': 'zh-TW',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  portuguese: 'pt',
  russian: 'ru',
  persian: 'fa',
  arabic: 'ar',
};

/** Resolve a stored language setting value to a UI locale. Falls back to English. */
export function toLocale(language: string | undefined | null): Locale {
  if (language && LANGUAGE_TO_LOCALE[language]) return LANGUAGE_TO_LOCALE[language];
  return DEFAULT_LOCALE;
}

/** Locales that are read right-to-left. Single source of truth for RTL detection. */
export const RTL_LOCALES: readonly Locale[] = ['fa', 'ar'];

/**
 * Whether a stored "Interface Language" setting value (e.g. 'persian', 'arabic')
 * reads right-to-left. Unknown/unset values are treated as LTR (English default).
 */
export function isRtlLanguage(language: string | undefined | null): boolean {
  return RTL_LOCALES.includes(toLocale(language));
}
