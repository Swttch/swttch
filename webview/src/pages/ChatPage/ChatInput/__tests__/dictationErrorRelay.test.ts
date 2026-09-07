import { describe, it, expect } from 'vitest';
import { resources } from '@/i18n/config';

/**
 * A dictation failure we do not recognise is relayed verbatim.
 *
 * The stream can refuse for reasons we cannot name. A 401 handshake rejection
 * is an expired token, or an account without access, or something we have not
 * seen; the next failure may be none of those. Any wording of ours would have
 * to pick one and be wrong for the rest, and it would throw away the one string
 * the user can search for or paste into an issue (#418).
 *
 * So the contract is: whatever arrives, the user sees it. `{{message}}` is
 * where it goes, and a locale that drops the placeholder has silently replaced
 * a real error with a guess.
 *
 * Kept as a test on the strings rather than on the banner because this is a
 * rule about what we are allowed to say, not about how it is drawn. Rewording
 * for kindness is exactly the edit that would break it, and that edit happens
 * in these files.
 */

const RELAY_KEYS = ['error', 'errorFatal'] as const;

function dictationStrings(locale: string): Record<string, string> {
  const chat = (resources as Record<string, Record<string, unknown>>)[locale]?.chat as
    | { chatInput?: { dictation?: Record<string, string> } }
    | undefined;
  const dictation = chat?.chatInput?.dictation;
  if (!dictation) throw new Error(`no dictation strings for locale ${locale}`);
  return dictation;
}

describe('dictation errors we cannot name are relayed, not rewritten', () => {
  const locales = Object.keys(resources);

  it('has locales to check', () => {
    // Guards the loops below: an empty resource map would make every test pass
    // by iterating over nothing.
    expect(locales.length).toBeGreaterThan(0);
  });

  for (const key of RELAY_KEYS) {
    it(`keeps the original text in "${key}" for every locale`, () => {
      const missing = locales.filter((l) => !dictationStrings(l)[key]?.includes('{{message}}'));
      expect(missing).toEqual([]);
    });
  }

  it('says in errorFatal that retrying will not help, beyond relaying the text', () => {
    // `fatal` is reported BY the stream, so passing it on is relaying too. What
    // it must not do is replace the message: the extra sentence is added to the
    // original, never instead of it.
    for (const locale of locales) {
      const strings = dictationStrings(locale);
      expect(strings.errorFatal).not.toBe(strings.error);
      expect(strings.errorFatal.length).toBeGreaterThan(strings.error.length);
    }
  });

  it('offers a way out of a message we deliberately did not rewrite', () => {
    // Relaying a string the user cannot act on is only half an answer. The
    // reporter's actual complaint was that there was nothing else at all:
    // "There is no additional information, manuals, docs. Nothing."
    const missing = locales.filter((l) => !dictationStrings(l).help?.trim());
    expect(missing).toEqual([]);
  });
});
