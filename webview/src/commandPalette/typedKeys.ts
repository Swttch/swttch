import { hangulToQwerty } from './hangulKeys';
import { initialsOf } from './commandInitials';

/**
 * Typing a slash command with another layout still on, read from the keys
 * instead of from the letters.
 *
 * `KeyboardEvent.code` names the physical key (`KeyR`), whatever letter the
 * layout turned it into. Writing down the code of every key pressed gives the
 * line as it would read on a US keyboard, so `/rename` typed on a Korean,
 * Russian or Greek layout is found without a table for each of them.
 *
 * The record only counts while it provably matches the box: the line must have
 * been typed from its first character, with the caret at the end, by plain
 * keystrokes. A paste, a cut, an undo, a caret moved into the middle or a line
 * recalled from the history breaks that, and the record is then set aside until
 * the box is empty again. Callers fall back to the two-set Hangul table.
 */

/** The keys of a US keyboard that can be part of a command name, by `code`. */
const SHIFTED_CODES: Record<string, [plain: string, shifted: string]> = {
  Minus: ['-', '_'],
  Semicolon: [';', ':'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
  Space: [' ', ' '],
};

/** inputTypes a keystroke produces; any other one is an edit we cannot follow. */
const TYPING_INPUT_TYPES = new Set([
  'insertText',
  'insertCompositionText',
  'insertFromComposition',
  'deleteCompositionText',
  'deleteByComposition',
  'deleteContentBackward',
]);

/** The subset of a `KeyboardEvent` the record reads. */
export interface KeyStroke {
  code: string;
  /** The character the layout made of the key, or a name such as `Process` while an IME holds it. */
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

const NON_ASCII = /[^\x00-\x7f]/;

/**
 * The US-keyboard character of a key, or null when it is not one we record.
 *
 * Letters come from the physical key. Punctuation and digits come from what the
 * key produced when that is a plain ASCII character, because layouts reach them
 * from different keys (the Russian layout types "/" with Shift+7), and such a
 * character is the same on every layout. Under an IME the key is only a name,
 * and the physical key stands in.
 */
function characterOf(stroke: KeyStroke): string | null {
  const letter = /^Key([A-Z])$/.exec(stroke.code);
  if (letter) return stroke.shiftKey ? letter[1] : letter[1].toLowerCase();
  if (/^[\x20-\x7e]$/.test(stroke.key)) return stroke.key;
  const digit = /^Digit([0-9])$/.exec(stroke.code);
  if (digit) return digit[1];
  const pair = SHIFTED_CODES[stroke.code];
  if (pair) return stroke.shiftKey ? pair[1] : pair[0];
  return null;
}

export class TypedKeys {
  private keys = '';
  private trusted = true;
  private lastText = '';

  /**
   * A key went down in the composer.
   *
   * @param caretAtEnd true when nothing is selected and the caret sits after the
   *   last character, which is the only place a keystroke extends the record.
   */
  noteKeyDown(stroke: KeyStroke, caretAtEnd: boolean): void {
    if (stroke.code === 'Backspace') {
      if (!caretAtEnd || stroke.ctrlKey || stroke.metaKey || stroke.altKey) {
        this.trusted = false;
        return;
      }
      this.keys = this.keys.slice(0, -1);
      return;
    }
    if (stroke.code === 'Delete') {
      this.trusted = false;
      return;
    }
    if (stroke.ctrlKey || stroke.metaKey || stroke.altKey) return;
    const character = characterOf(stroke);
    if (character === null) return;
    if (!caretAtEnd) {
      this.trusted = false;
      return;
    }
    this.keys += character;
  }

  /** The editor reported an edit. Anything a keystroke cannot cause voids the record. */
  noteInput(inputType: string): void {
    if (!TYPING_INPUT_TYPES.has(inputType)) this.trusted = false;
  }

  /**
   * The user's typing made the text of the box `text`. Starts the record over
   * when the box is empty or no longer begins with a slash, since only a line
   * that starts as a command is read from the keys.
   */
  noteTyped(text: string): void {
    this.lastText = text;
    if (text === '' || !text.startsWith('/')) this.reset();
  }

  /**
   * The box holds `value` now, whoever put it there. A value other than the
   * one typing just produced is a history recall, a submit or an inserted
   * snippet, and no keystroke accounts for it.
   */
  noteValue(value: string): void {
    if (value !== this.lastText) this.reset();
    this.lastText = value;
  }

  private reset(): void {
    this.keys = '';
    this.trusted = true;
  }

  /**
   * `text` as it reads on a US keyboard.
   *
   * Text that is plain ASCII is returned as it is: the layout already produced
   * the letters, and the physical keys (a Dvorak or AZERTY user) would only add
   * wrong commands. Otherwise the record is used when it covers the text, and
   * the Hangul table when it does not.
   */
  keysFor(text: string): string {
    if (!NON_ASCII.test(text)) return text;
    if (this.trusted && text.startsWith('/') && this.keys.startsWith('/') && this.keys.length >= [...text].length) {
      return this.keys;
    }
    return hangulToQwerty(text);
  }

  /**
   * The same for a command name typed after the slash (`ㄱㄷ`, no `/`).
   *
   * The record covers the whole line, arguments included (`/rename title`),
   * while the name is only the first word of it, so the rest is cut off.
   */
  keysForQuery(query: string): string {
    return this.keysFor('/' + query).slice(1).split(/\s/, 1)[0];
  }
}

/** The composer is one at a time, so one record serves every reader. */
export const typedKeys = new TypedKeys();

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
  if (typed && typedKeys.keysFor(input).split(/\s/, 1)[0].toLowerCase() === commandName.toLowerCase()) {
    return commandName + input.slice(typed.length);
  }
  // The initials of the name ("/gwd" for /grill-with-docs, issue #666): the
  // command was picked from the list, so the first word is put back whole and
  // the arguments after it stay.
  const initials = initialsOf(commandName);
  if (typed && initials && typed.toLowerCase() === `/${initials}`) {
    return commandName + input.slice(typed.length);
  }
  return input;
}
