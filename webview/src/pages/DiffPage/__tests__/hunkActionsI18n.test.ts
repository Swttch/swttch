/**
 * How the hunk controls are worded across locales.
 *
 * Two rules, and they are opposites on purpose:
 *
 *  - The four BUTTONS stay English everywhere. They are peers sitting together
 *    on one row, and mixing languages there shipped a Korean review reading
 *    (quoting the screen) "적용", "되돌리기" and "Reset" — same kind of control,
 *    two languages, no reason a reader could infer.
 *  - Everything the reviewer READS is translated: the tooltips explaining what
 *    each of those buttons undoes, and the counter.
 *
 * Both directions are asserted, because the failure mode is a later edit
 * translating one button "for consistency" or leaving one tooltip in English.
 */
import { describe, it, expect } from 'vitest';
import { resources } from '@/i18n/config';

const locales: string[] = Object.keys(resources);

/**
 * Labels that must read the same in every locale.
 *
 * These four sit together on one row over the code. `selectAll` is NOT among
 * them: it labels a checkbox in the header, beside Confirm and Cancel, and
 * takes that row's language rather than the buttons'.
 */
const BUTTONS = ['accept', 'deny', 'reset', 'back'] as const;
/** Prose that must not. */
const PROSE = ['resetHint', 'backHint'] as const;

/** Latin-script locales share words with English, so they prove nothing. */
const NON_LATIN = ['ko', 'ja', 'zh', 'zh-TW', 'ru', 'ar', 'fa'];

function hunkStrings(locale: string): Record<string, string> {
  const chat = resources[locale].chat as Record<string, any>;
  return chat.diffPage?.hunk ?? {};
}

describe('hunk control wording', () => {
  it('defines every string in every locale', () => {
    for (const locale of locales) {
      const strings = hunkStrings(locale);
      for (const key of [...BUTTONS, ...PROSE, 'selectAll', 'remaining']) {
        expect(strings[key], `${locale}.diffPage.hunk.${key}`).toBeTruthy();
      }
    }
  });

  it('keeps the four buttons identical across locales', () => {
    const english = hunkStrings('en');

    for (const locale of locales) {
      const strings = hunkStrings(locale);
      for (const key of BUTTONS) {
        expect(strings[key], `${locale}.diffPage.hunk.${key} drifted from English`).toBe(
          english[key],
        );
      }
    }
  });

  it('translates the tooltips, which are prose rather than labels', () => {
    const english = hunkStrings('en');

    for (const locale of NON_LATIN) {
      const strings = hunkStrings(locale);
      for (const key of PROSE) {
        expect(strings[key], `${locale}.diffPage.hunk.${key} left in English`).not.toBe(
          english[key],
        );
      }
    }
  });

  it('keeps the count placeholder in every locale', () => {
    // Losing it prints the sentence with no number in it.
    for (const locale of locales) {
      expect(hunkStrings(locale).remaining, `${locale}.diffPage.hunk.remaining`).toContain(
        '{{count}}',
      );
    }
  });
});
