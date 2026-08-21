/**
 * The soft-wrap toggle (#179) is a new Appearance setting, and a missing
 * translation shows a raw key rather than failing a type check.
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

describe('soft wrap setting i18n (#179)', () => {
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
});
