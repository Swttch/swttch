/**
 * The IDE section carries settings that used to live under General, so the
 * move must not cost a user their existing translations or their stored value.
 *
 * Two settings (`attachEditorContext`, `focusInputOnEditorContext`) were
 * translated into twelve locales long before this section existed. Renaming
 * their i18n namespace without carrying the strings over would leave those
 * users staring at raw keys, and dropping a locale would silently fall back to
 * English — neither shows up in a type check.
 */
import { describe, it, expect } from 'vitest';
import { resources } from '@/i18n/config';

// Read the same bundle the app ships rather than the files on disk: the webview
// builds for the browser, and a test that reached for node:fs would type-check
// under vitest but break the production build.
const locales: string[] = Object.keys(resources);

function settingsOf(locale: string): Record<string, any> {
  return resources[locale].settings as Record<string, any>;
}

/**
 * Assert something for every locale, naming the failing one.
 *
 * A plain loop inside one test rather than `it.each`: the whole point is that a
 * locale is missing, and the assertion message carries which — splitting it
 * into twelve near-identical cases adds noise without adding information.
 */
function forEachLocale(assert: (locale: string) => void): void {
  for (const locale of locales) assert(locale);
}

describe('IDE settings section i18n', () => {
  it('ships every locale we already had', () => {
    // Guards against a migration script that quietly skips a locale.
    expect(locales.length).toBeGreaterThanOrEqual(12);
  });

  it('gives every locale the sidebar entry', () => {
    forEachLocale((locale) => {
      expect(settingsOf(locale).nav?.ide, `${locale}.nav.ide`).toBeTruthy();
    });
  });

  it('keeps the carried-over settings translated in every locale', () => {
    forEachLocale((locale) => {
      const ide = settingsOf(locale).ide;
      for (const key of ['attachEditorContext', 'focusInputOnEditorContext']) {
        expect(ide?.[key]?.label, `${locale}.ide.${key}.label`).toBeTruthy();
        expect(ide?.[key]?.description, `${locale}.ide.${key}.description`).toBeTruthy();
      }
    });
  });

  // Choosing where a proposed edit is reviewed moved to General's Diff View
  // section, because its companion setting (how the built-in viewer opens) has
  // nothing to do with an IDE. See DiffViewSection.
  it('no longer keeps the diff-surface strings under ide', () => {
    forEachLocale((locale) => {
      expect(settingsOf(locale).ide?.showDiffInIde, `${locale}.ide.showDiffInIde`).toBeUndefined();
    });
  });

  it('no longer keeps the moved keys under general', () => {
    // Leftovers would drift: one copy edited, the other stale and unused.
    forEachLocale((locale) => {
      const general = settingsOf(locale).general;
      expect(general?.attachEditorContext, `${locale}.general.attachEditorContext`).toBeUndefined();
      expect(general?.focusInputOnEditorContext, `${locale}.general.focusInputOnEditorContext`).toBeUndefined();
    });
  });

  it('translates the section strings rather than leaving English everywhere', () => {
    // A migration that seeds English placeholders passes every check above.
    // Non-Latin locales must actually differ from the English source.
    const en = settingsOf('en').ide.attachEditorContext.label;
    for (const locale of ['ko', 'ja', 'zh', 'ru', 'ar', 'fa']) {
      expect(settingsOf(locale).ide.attachEditorContext.label, locale).not.toBe(en);
    }
  });
});
