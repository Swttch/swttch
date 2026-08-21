/**
 * The soft-wrap toggle (issue #179) is a new Appearance setting, and adding it
 * came with removing the "Theme" section heading above it. Both are i18n-facing:
 * a missing translation shows a raw key, and a leftover heading string would sit
 * in twelve files with nothing rendering it.
 */
import { describe, it, expect } from 'vitest';
import { resources } from '@/i18n/config';

// Read the shipped bundle rather than the files on disk — the webview builds for
// the browser, so a test reaching for node:fs would type-check and then break
// the production build.
const locales: string[] = Object.keys(resources);

function appearanceOf(locale: string): Record<string, any> {
  return (resources[locale].settings as Record<string, any>).appearance;
}

function forEachLocale(assert: (locale: string) => void): void {
  for (const locale of locales) assert(locale);
}

describe('soft wrap setting i18n', () => {
  it('ships every locale we already had', () => {
    expect(locales.length).toBeGreaterThanOrEqual(12);
  });

  it('translates the toggle in every locale', () => {
    forEachLocale((locale) => {
      const softWrap = appearanceOf(locale)?.softWrap;
      for (const key of ['label', 'description']) {
        expect(softWrap?.[key], `${locale}.appearance.softWrap.${key}`).toBeTruthy();
      }
    });
  });

  it('translates the new strings rather than leaving English everywhere', () => {
    // A migration that seeds English placeholders passes the check above.
    const en = appearanceOf('en').softWrap.label;
    for (const locale of ['ko', 'ja', 'zh', 'ru', 'ar', 'fa']) {
      expect(appearanceOf(locale).softWrap.label, locale).not.toBe(en);
    }
  });

  it('drops the retired Theme section heading in every locale', () => {
    // Nothing renders it any more; a leftover copy would drift out of sync with
    // no screen to catch it.
    forEachLocale((locale) => {
      expect(
        appearanceOf(locale)?.theme?.sectionTitle,
        `${locale}.appearance.theme.sectionTitle`,
      ).toBeUndefined();
    });
  });

  it('keeps the settings that lived under that heading', () => {
    // Removing the heading must not take its rows with it.
    forEachLocale((locale) => {
      const theme = appearanceOf(locale)?.theme;
      for (const key of ['colorTheme', 'fontSize', 'lineSpacing']) {
        expect(theme?.[key]?.label, `${locale}.appearance.theme.${key}.label`).toBeTruthy();
      }
    });
  });
});
