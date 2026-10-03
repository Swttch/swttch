import { describe, it, expect } from 'vitest';
import { EmacsTextKey, parseEmacsTextKey, parseEmacsTextKeyPress } from '../emacs-text-key';

/**
 * The backend routes EMACS_TEXT_KEY_PRESSED from the IDE to a panel only when
 * the key is one of the fourteen letters the IDE sends. Anything else is
 * dropped, so a malformed notification never reaches a webview as an edit.
 */
describe('parseEmacsTextKey', () => {
  it.each([
    ['a', EmacsTextKey.A],
    ['b', EmacsTextKey.B],
    ['d', EmacsTextKey.D],
    ['e', EmacsTextKey.E],
    ['f', EmacsTextKey.F],
    ['h', EmacsTextKey.H],
    ['k', EmacsTextKey.K],
    ['l', EmacsTextKey.L],
    ['n', EmacsTextKey.N],
    ['o', EmacsTextKey.O],
    ['p', EmacsTextKey.P],
    ['t', EmacsTextKey.T],
    ['v', EmacsTextKey.V],
    ['y', EmacsTextKey.Y],
  ])('accepts %s', (value, expected) => {
    expect(parseEmacsTextKey(value)).toBe(expected);
  });

  it('has exactly the fourteen macOS Ctrl+letter text bindings', () => {
    expect(Object.values(EmacsTextKey).sort()).toEqual(
      ['a', 'b', 'd', 'e', 'f', 'h', 'k', 'l', 'n', 'o', 'p', 't', 'v', 'y'],
    );
  });

  it('rejects other letters, uppercase, padding and the empty string', () => {
    for (const value of ['c', 'g', 'z', 'B', 'K', ' b', 'b ', 'ab', '']) {
      expect(parseEmacsTextKey(value)).toBeNull();
    }
  });
});

/**
 * The backend forwards { key, shift } to the panel's webview. Shift comes from
 * the IDE's key event; anything but the JSON boolean true reads as false.
 */
describe('parseEmacsTextKeyPress', () => {
  it('carries the letter and a true shift', () => {
    expect(parseEmacsTextKeyPress({ key: 'b', shift: true })).toEqual({ key: EmacsTextKey.B, shift: true });
  });

  it('carries a false shift', () => {
    expect(parseEmacsTextKeyPress({ key: 'e', shift: false })).toEqual({ key: EmacsTextKey.E, shift: false });
  });

  it('reads an absent or non-boolean shift as false', () => {
    for (const shift of [undefined, null, 'true', 1, 0, {}]) {
      expect(parseEmacsTextKeyPress({ key: 'f', shift })).toEqual({ key: EmacsTextKey.F, shift: false });
    }
    expect(parseEmacsTextKeyPress({ key: 'f' })).toEqual({ key: EmacsTextKey.F, shift: false });
  });

  it('drops a payload whose key is not one of the fourteen', () => {
    for (const key of ['c', 'B', '', 2, null, undefined]) {
      expect(parseEmacsTextKeyPress({ key, shift: true })).toBeNull();
    }
    expect(parseEmacsTextKeyPress({})).toBeNull();
  });
});
