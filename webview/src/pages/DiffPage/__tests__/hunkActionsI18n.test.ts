/**
 * The three hunk buttons must be translated together.
 *
 * Keep, Undo and Reset are peers: two of them show while a hunk is undecided,
 * the third replaces them once it is answered. Leaving one in English shipped a
 * Korean review whose three buttons read (quoting the screen) "적용", "되돌리기"
 * and "Reset" — the same kind of control in two languages, with no reason a
 * reader could infer.
 *
 * The rule is all-or-nothing per locale, and it is asserted here because the
 * alternative is remembering it, which is what failed the first time.
 */
import { describe, it, expect } from 'vitest';
import { resources } from '@/i18n/config';

const locales: string[] = Object.keys(resources);

/** The three peer labels for one locale. */
function actionsOf(locale: string): Record<string, string> {
  const chat = resources[locale].chat as Record<string, any>;
  return chat.diffPage?.hunk ?? {};
}

/** Latin-script locales share words with English, so they prove nothing here. */
const NON_LATIN = ['ko', 'ja', 'zh', 'zh-TW', 'ru', 'ar', 'fa'];

describe('hunk action labels', () => {
  it('defines all three in every locale', () => {
    for (const locale of locales) {
      const actions = actionsOf(locale);
      for (const key of ['keep', 'undo', 'reset']) {
        expect(actions[key], `${locale}.diffPage.hunk.${key}`).toBeTruthy();
      }
    }
  });

  // The failure this file exists for: one peer left as the English source while
  // the other two were translated.
  it('translates all three, or none, in each non-Latin locale', () => {
    const english = actionsOf('en');

    for (const locale of NON_LATIN) {
      const actions = actionsOf(locale);
      const untranslated = ['keep', 'undo', 'reset'].filter(
        (key) => actions[key] === english[key],
      );

      expect(
        untranslated,
        `${locale} leaves ${untranslated.join(', ')} in English beside translated peers`,
      ).toEqual([]);
    }
  });

  it('keeps the tooltips translated too', () => {
    const english = actionsOf('en');

    for (const locale of NON_LATIN) {
      const actions = actionsOf(locale);
      for (const key of ['resetFromKeep', 'resetFromUndo']) {
        expect(actions[key], `${locale}.diffPage.hunk.${key}`).toBeTruthy();
        expect(actions[key], `${locale}.diffPage.hunk.${key}`).not.toBe(english[key]);
      }
    }
  });

  it('keeps the count placeholder in every locale', () => {
    // Losing it would print the sentence with no number in it.
    for (const locale of locales) {
      expect(actionsOf(locale).remaining, `${locale}.diffPage.hunk.remaining`).toContain(
        '{{count}}',
      );
    }
  });
});
