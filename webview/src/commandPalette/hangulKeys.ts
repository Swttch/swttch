/**
 * Typing a slash command with the Korean layout still on.
 *
 * `/rename` typed on a Korean keyboard comes out as `/ㄱㄷㅜㅁㅡㄷ`, or as
 * `/ㄱ두믇` once the input method has joined the letters into syllables. The
 * keys pressed were the right ones; only the layout was wrong. Turning the
 * Hangul back into the keys that produce it lets the palette find the command
 * the user meant, without asking them to switch layouts and retype.
 *
 * The mapping is the standard two-set (dubeolsik) layout. A syllable is taken
 * apart into its lead consonant, vowel and optional trailing consonant first,
 * since the input method has already joined them by the time we see the text.
 */

/** Lead consonants of a syllable, in Unicode order. */
const LEADS = ['r', 'R', 's', 'e', 'E', 'f', 'a', 'q', 'Q', 't', 'T', 'd', 'w', 'W', 'c', 'z', 'x', 'v', 'g'];

/** Vowels of a syllable, in Unicode order. The compound ones take two keys. */
const VOWELS = [
  'k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l',
];

/** Trailing consonants of a syllable, in Unicode order, with "none" first. */
const TRAILS = [
  '', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T',
  'd', 'w', 'c', 'z', 'x', 'v', 'g',
];

/** Letters typed on their own, which the input method leaves unjoined. */
const STANDALONE_JAMO: Record<string, string> = {
  'ㄱ': 'r', 'ㄲ': 'R', 'ㄴ': 's', 'ㄷ': 'e', 'ㄸ': 'E', 'ㄹ': 'f', 'ㅁ': 'a', 'ㅂ': 'q', 'ㅃ': 'Q', 'ㅅ': 't',
  'ㅆ': 'T', 'ㅇ': 'd', 'ㅈ': 'w', 'ㅉ': 'W', 'ㅊ': 'c', 'ㅋ': 'z', 'ㅌ': 'x', 'ㅍ': 'v', 'ㅎ': 'g',
  'ㅏ': 'k', 'ㅐ': 'o', 'ㅑ': 'i', 'ㅒ': 'O', 'ㅓ': 'j', 'ㅔ': 'p', 'ㅕ': 'u', 'ㅖ': 'P', 'ㅗ': 'h', 'ㅘ': 'hk',
  'ㅙ': 'ho', 'ㅚ': 'hl', 'ㅛ': 'y', 'ㅜ': 'n', 'ㅝ': 'nj', 'ㅞ': 'np', 'ㅟ': 'nl', 'ㅠ': 'b', 'ㅡ': 'm', 'ㅢ': 'ml',
  'ㅣ': 'l',
  'ㄳ': 'rt', 'ㄵ': 'sw', 'ㄶ': 'sg', 'ㄺ': 'fr', 'ㄻ': 'fa', 'ㄼ': 'fq', 'ㄽ': 'ft', 'ㄾ': 'fx', 'ㄿ': 'fv',
  'ㅀ': 'fg', 'ㅄ': 'qt',
};

const SYLLABLE_FIRST = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
const VOWEL_COUNT = 21;
const TRAIL_COUNT = 28;

/**
 * The keys that produce `text` on a Korean layout, with everything that is not
 * Hangul left as it is. Case is kept (Shift gives `R` for ㄲ); callers that
 * compare names lowercase both sides.
 */
export function hangulToQwerty(text: string): string {
  let keys = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= SYLLABLE_FIRST && code <= SYLLABLE_LAST) {
      const offset = code - SYLLABLE_FIRST;
      const lead = Math.floor(offset / (VOWEL_COUNT * TRAIL_COUNT));
      const vowel = Math.floor((offset % (VOWEL_COUNT * TRAIL_COUNT)) / TRAIL_COUNT);
      const trail = offset % TRAIL_COUNT;
      keys += LEADS[lead] + VOWELS[vowel] + TRAILS[trail];
    } else {
      keys += STANDALONE_JAMO[char] ?? char;
    }
  }
  return keys;
}

/**
 * Put a command typed on the wrong layout back under its real name.
 *
 * Commands read their arguments off the typed line by looking for their own
 * name at the start (`/model sonnet`). A line that starts with `/ㅡㅐㅇ디` has
 * the right command and none of those checks would see it, so the arguments
 * would be dropped. The line is returned with only its first word rewritten
 * when that word is `commandName` in disguise; every other line comes back
 * untouched.
 */
export function restoreCommandName(input: string, commandName: string): string {
  if (input.startsWith(commandName)) return input;
  const typed = input.split(/\s/, 1)[0];
  if (typed && hangulToQwerty(typed).toLowerCase() === commandName.toLowerCase()) {
    return commandName + input.slice(typed.length);
  }
  return input;
}
