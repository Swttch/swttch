/**
 * The Diff View section decides where a proposed file edit is reviewed. Its
 * strings are new, and a locale that is missing one silently falls back to
 * English — which no type check catches.
 *
 * Mirrors ideSection.test.ts, including its sharpest assertion: seeding every
 * locale with the English text passes a plain presence check, so the non-Latin
 * locales must actually differ from the English source.
 */
import { describe, it, expect } from 'vitest';
import { resources } from '@/i18n/config';
import { DiffSurface, BrowserDiffPresentation } from '@/types/settings';

const locales: string[] = Object.keys(resources);

function settingsOf(locale: string): Record<string, any> {
  return resources[locale].settings as Record<string, any>;
}

function forEachLocale(assert: (locale: string) => void): void {
  for (const locale of locales) assert(locale);
}

describe('Diff View settings section i18n', () => {
  it('names the section in every locale', () => {
    forEachLocale((locale) => {
      expect(settingsOf(locale).diffView?.sectionTitle, `${locale}.diffView.sectionTitle`).toBeTruthy();
    });
  });

  it('translates the surface choice in every locale', () => {
    forEachLocale((locale) => {
      const surface = settingsOf(locale).diffView?.surface;
      // `noIde` is the hint shown when no IDE hosts the backend; without it the
      // row reads as disabled for no stated reason.
      for (const key of ['label', 'description', 'noIde', 'ide', 'builtIn']) {
        expect(surface?.[key], `${locale}.diffView.surface.${key}`).toBeTruthy();
      }
    });
  });

  it('translates the browser presentation choice in every locale', () => {
    forEachLocale((locale) => {
      const presentation = settingsOf(locale).diffView?.presentation;
      for (const key of ['label', 'description', 'builtInOnly', 'newTab', 'overlay']) {
        expect(presentation?.[key], `${locale}.diffView.presentation.${key}`).toBeTruthy();
      }
    });
  });

  it('translates the new strings rather than leaving English everywhere', () => {
    const en = settingsOf('en').diffView.surface.label;
    for (const locale of ['ko', 'ja', 'zh', 'ru', 'ar', 'fa']) {
      expect(settingsOf(locale).diffView.surface.label, locale).not.toBe(en);
    }
  });

  // The option labels are what the user picks between; leaving them in English
  // would make the row half-translated.
  it('translates the option labels rather than leaving English everywhere', () => {
    const enNewTab = settingsOf('en').diffView.presentation.newTab;
    for (const locale of ['ko', 'ja', 'zh', 'ru', 'ar', 'fa']) {
      expect(settingsOf(locale).diffView.presentation.newTab, locale).not.toBe(enNewTab);
    }
  });

  // The stored values are a contract with the backend validator and with every
  // settings file already on disk; renaming one strands the user's choice.
  it('keeps the stored values stable', () => {
    expect(DiffSurface.IDE).toBe('ide');
    expect(DiffSurface.BUILT_IN).toBe('built-in');
    expect(BrowserDiffPresentation.NEW_TAB).toBe('new-tab');
    expect(BrowserDiffPresentation.OVERLAY).toBe('overlay');
  });
});
