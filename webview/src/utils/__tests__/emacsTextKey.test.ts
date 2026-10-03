import { describe, it, expect } from 'vitest';
import { EmacsTextKey } from '@/shared';
import {
  EmacsTextActionKind,
  EmacsTextEdit,
  emacsTextActionFor,
  emacsTextKeyFromKeydown,
  type EmacsTextKeydown,
} from '../emacsTextKey';
import { CaretBoundary, CaretDirection } from '@/utils/domSelection';

/**
 * Each Emacs text letter asks for what macOS binds it to in a native text
 * field. The letter reaches the webview from the IDE, so this mapping is the
 * only place the fourteen keys get their meaning.
 */
describe('emacsTextActionFor', () => {
  const moves: Array<[EmacsTextKey, CaretDirection, CaretBoundary]> = [
    [EmacsTextKey.B, CaretDirection.Backward, CaretBoundary.Character],
    [EmacsTextKey.F, CaretDirection.Forward, CaretBoundary.Character],
    [EmacsTextKey.P, CaretDirection.Backward, CaretBoundary.Row],
    [EmacsTextKey.N, CaretDirection.Forward, CaretBoundary.Row],
    [EmacsTextKey.A, CaretDirection.Backward, CaretBoundary.Paragraph],
    [EmacsTextKey.E, CaretDirection.Forward, CaretBoundary.Paragraph],
  ];

  it.each(moves)('maps Ctrl+%s to a move', (key, direction, boundary) => {
    expect(emacsTextActionFor(key, false)).toEqual({
      kind: EmacsTextActionKind.Move,
      move: { direction, boundary, extend: false },
    });
  });

  it.each(moves)('carries Shift through as extend for Ctrl+%s', (key, direction, boundary) => {
    expect(emacsTextActionFor(key, true)).toEqual({
      kind: EmacsTextActionKind.Move,
      move: { direction, boundary, extend: true },
    });
  });

  it('maps Ctrl+V to a page down that Shift extends', () => {
    expect(emacsTextActionFor(EmacsTextKey.V, false)).toEqual({ kind: EmacsTextActionKind.PageDown, extend: false });
    expect(emacsTextActionFor(EmacsTextKey.V, true)).toEqual({ kind: EmacsTextActionKind.PageDown, extend: true });
  });

  const edits: Array<[EmacsTextKey, EmacsTextEdit]> = [
    [EmacsTextKey.D, EmacsTextEdit.DeleteForward],
    [EmacsTextKey.H, EmacsTextEdit.DeleteBackward],
    [EmacsTextKey.K, EmacsTextEdit.KillToParagraphEnd],
    [EmacsTextKey.L, EmacsTextEdit.CenterCaret],
    [EmacsTextKey.O, EmacsTextEdit.OpenLine],
    [EmacsTextKey.T, EmacsTextEdit.Transpose],
    [EmacsTextKey.Y, EmacsTextEdit.Yank],
  ];

  it.each(edits)('maps Ctrl+%s to an edit', (key, edit) => {
    expect(emacsTextActionFor(key, false)).toEqual({ kind: EmacsTextActionKind.Edit, edit });
  });

  it.each(edits)('does nothing for Shift+Ctrl+%s, which macOS leaves unbound', (key) => {
    expect(emacsTextActionFor(key, true)).toBeNull();
  });

  it('covers every key of the enum', () => {
    for (const key of Object.values(EmacsTextKey)) {
      expect(emacsTextActionFor(key, false), key).not.toBeNull();
    }
  });
});

/** Hangul jamo the Korean 2-set layout puts in `key` for Ctrl+A, B, E and F (measured in Chrome). */
const JAMO_A = String.fromCharCode(0x3141);
const JAMO_B = String.fromCharCode(0x3160);
const JAMO_E = String.fromCharCode(0x3137);
const JAMO_F = String.fromCharCode(0x3139);
/** Hangul jamo on the C and X keys of the same layout. */
const JAMO_C = String.fromCharCode(0x314a);
const JAMO_X = String.fromCharCode(0x314c);

function keydown(overrides: Partial<EmacsTextKeydown>): EmacsTextKeydown {
  return {
    key: JAMO_B,
    code: 'KeyB',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    ...overrides,
  };
}

/**
 * Chrome on macOS performs the Emacs text keys itself only under a Latin
 * layout. Under a non-Latin one `key` is the layout character, `code` still
 * names the physical key, and Chrome does nothing, so the letter is read from
 * `code`.
 */
describe('emacsTextKeyFromKeydown', () => {
  it('reads the letter from code when key is a Korean jamo', () => {
    expect(emacsTextKeyFromKeydown(keydown({}))).toEqual({ key: EmacsTextKey.B, shift: false });
    expect(emacsTextKeyFromKeydown(keydown({ key: JAMO_A, code: 'KeyA' }))).toEqual({ key: EmacsTextKey.A, shift: false });
    expect(emacsTextKeyFromKeydown(keydown({ key: JAMO_E, code: 'KeyE' }))).toEqual({ key: EmacsTextKey.E, shift: false });
    expect(emacsTextKeyFromKeydown(keydown({ key: JAMO_F, code: 'KeyF' }))).toEqual({ key: EmacsTextKey.F, shift: false });
  });

  it('carries Shift through for the uppercase variant', () => {
    expect(emacsTextKeyFromKeydown(keydown({ shiftKey: true }))).toEqual({ key: EmacsTextKey.B, shift: true });
  });

  it('covers all fourteen letters', () => {
    for (const key of Object.values(EmacsTextKey)) {
      expect(emacsTextKeyFromKeydown(keydown({ code: `Key${key.toUpperCase()}` }))?.key, key).toBe(key);
    }
  });

  it('leaves an ASCII letter to the browser, which already performs it', () => {
    expect(emacsTextKeyFromKeydown(keydown({ key: 'b' }))).toBeNull();
    expect(emacsTextKeyFromKeydown(keydown({ key: 'B', shiftKey: true }))).toBeNull();
  });

  it('ignores Cmd and Option combinations', () => {
    expect(emacsTextKeyFromKeydown(keydown({ metaKey: true }))).toBeNull();
    expect(emacsTextKeyFromKeydown(keydown({ altKey: true }))).toBeNull();
  });

  it('ignores a keydown without Ctrl', () => {
    expect(emacsTextKeyFromKeydown(keydown({ ctrlKey: false }))).toBeNull();
  });

  it('ignores a keydown inside an IME composition', () => {
    expect(emacsTextKeyFromKeydown(keydown({ isComposing: true }))).toBeNull();
  });

  it('ignores letters outside the fourteen', () => {
    expect(emacsTextKeyFromKeydown(keydown({ key: JAMO_C, code: 'KeyC' }))).toBeNull();
    expect(emacsTextKeyFromKeydown(keydown({ key: JAMO_X, code: 'KeyX' }))).toBeNull();
  });

  it('ignores codes that are not letter keys', () => {
    expect(emacsTextKeyFromKeydown(keydown({ key: 'ArrowLeft', code: 'ArrowLeft' }))).toBeNull();
    expect(emacsTextKeyFromKeydown(keydown({ key: '1', code: 'Digit1' }))).toBeNull();
    expect(emacsTextKeyFromKeydown(keydown({ code: 'Keyb' }))).toBeNull();
  });

  it('ignores a keydown with no code', () => {
    expect(emacsTextKeyFromKeydown(keydown({ code: undefined }))).toBeNull();
    expect(emacsTextKeyFromKeydown(keydown({ code: '' }))).toBeNull();
  });
});
