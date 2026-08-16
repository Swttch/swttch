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
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES_DIR = join(__dirname, '..', '..', '..', 'i18n', 'locales');
const locales = readdirSync(LOCALES_DIR);

function settingsOf(locale: string): Record<string, any> {
  return JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'settings.json'), 'utf8'));
}

describe('IDE settings section i18n', () => {
  it('ships every locale we already had', () => {
    // Guards against a migration script that quietly skips a locale.
    expect(locales.length).toBeGreaterThanOrEqual(12);
  });

  it.each(locales)('%s has the sidebar entry', (locale) => {
    expect(settingsOf(locale).nav?.ide).toBeTruthy();
  });

  it.each(locales)('%s kept the carried-over settings translated', (locale) => {
    const ide = settingsOf(locale).ide;
    for (const key of ['attachEditorContext', 'focusInputOnEditorContext']) {
      expect(ide?.[key]?.label, `${locale}.ide.${key}.label`).toBeTruthy();
      expect(ide?.[key]?.description, `${locale}.ide.${key}.description`).toBeTruthy();
    }
  });

  it.each(locales)('%s translates the new IDE-diff toggle', (locale) => {
    const diff = settingsOf(locale).ide?.showDiffInIde;
    // `unavailable` is the hint shown when no IDE is attached; without it a
    // standalone user sees a dead toggle and no reason why.
    for (const key of ['label', 'description', 'unavailable']) {
      expect(diff?.[key], `${locale}.ide.showDiffInIde.${key}`).toBeTruthy();
    }
  });

  it.each(locales)('%s no longer keeps the moved keys under general', (locale) => {
    // Leftovers would drift: one copy edited, the other stale and unused.
    const general = settingsOf(locale).general;
    expect(general?.attachEditorContext).toBeUndefined();
    expect(general?.focusInputOnEditorContext).toBeUndefined();
  });

  it('translates the new strings rather than leaving English everywhere', () => {
    // A migration that seeds English placeholders passes every check above.
    // Non-Latin locales must actually differ from the English source.
    const en = settingsOf('en').ide.showDiffInIde.label;
    for (const locale of ['ko', 'ja', 'zh', 'ru', 'ar', 'fa']) {
      expect(settingsOf(locale).ide.showDiffInIde.label, locale).not.toBe(en);
    }
  });
});
