import { EmacsTextKey, parseEmacsTextKey } from '@/shared';
import type { EmacsTextKeyPress } from '@/shared';
import { CaretBoundary, CaretDirection } from '@/utils/domSelection';
import type { CaretBoundaryMove } from '@/utils/caretBoundaryKey';

/** The edits among the Emacs text keys, each named after what it does to the text. */
export enum EmacsTextEdit {
  /** Ctrl+D, `deleteForward:`. */
  DeleteForward = 'deleteForward',
  /** Ctrl+H, `deleteBackward:`. */
  DeleteBackward = 'deleteBackward',
  /** Ctrl+K, `deleteToEndOfParagraph:` into the kill ring. */
  KillToParagraphEnd = 'killToParagraphEnd',
  /** Ctrl+L, `centerSelectionInVisibleArea:`. Scrolls, does not change the text. */
  CenterCaret = 'centerCaret',
  /** Ctrl+O, a line break after the caret. */
  OpenLine = 'openLine',
  /** Ctrl+T, `transpose:`. */
  Transpose = 'transpose',
  /** Ctrl+Y, `yank:` from the kill ring. */
  Yank = 'yank',
}

/** What kind of thing an Emacs text key does. */
export enum EmacsTextActionKind {
  /** A caret step that Shift turns into a selection extension. */
  Move = 'move',
  /** Ctrl+V: one page of rows down, which Shift also extends. */
  PageDown = 'pageDown',
  /** Everything that changes the text or the scroll position. */
  Edit = 'edit',
}

export type EmacsTextAction =
  | { kind: EmacsTextActionKind.Move; move: CaretBoundaryMove }
  | { kind: EmacsTextActionKind.PageDown; extend: boolean }
  | { kind: EmacsTextActionKind.Edit; edit: EmacsTextEdit };

/**
 * What a macOS Emacs-style key asks for, the same bindings macOS gives every
 * native text field (AppKit's `StandardKeyBinding.dict`): B and F step one
 * character, P and N one row, A and E go to the paragraph's start and end, V
 * goes one page down, and D, H, K, L, O, T, Y edit.
 *
 * In the IDE the letter comes from the IDE (EMACS_TEXT_KEY_PRESSED), not from a
 * keydown: under JCEF off-screen rendering every Ctrl+letter reaches the page as
 * Ctrl+A. In a browser it comes from a keydown under a non-Latin layout (see
 * emacsTextKeyFromKeydown).
 *
 * Shift only has a binding for the moves (A, B, E, F, N, P, V), where it
 * extends the selection (`moveBackwardAndModifySelection:` and friends). macOS
 * binds nothing to Shift with the edit keys, so a press of one of those with
 * Shift held returns null and does nothing.
 *
 * @param shiftHeld Shift was held, as the IDE read it from its key event.
 */
export function emacsTextActionFor(key: EmacsTextKey, shiftHeld: boolean): EmacsTextAction | null {
  const move = (direction: CaretDirection, boundary: CaretBoundary): EmacsTextAction => ({
    kind: EmacsTextActionKind.Move,
    move: { direction, boundary, extend: shiftHeld },
  });
  const edit = (value: EmacsTextEdit): EmacsTextAction | null =>
    shiftHeld ? null : { kind: EmacsTextActionKind.Edit, edit: value };

  switch (key) {
    case EmacsTextKey.B:
      return move(CaretDirection.Backward, CaretBoundary.Character);
    case EmacsTextKey.F:
      return move(CaretDirection.Forward, CaretBoundary.Character);
    case EmacsTextKey.P:
      return move(CaretDirection.Backward, CaretBoundary.Row);
    case EmacsTextKey.N:
      return move(CaretDirection.Forward, CaretBoundary.Row);
    case EmacsTextKey.A:
      return move(CaretDirection.Backward, CaretBoundary.Paragraph);
    case EmacsTextKey.E:
      return move(CaretDirection.Forward, CaretBoundary.Paragraph);
    case EmacsTextKey.V:
      return { kind: EmacsTextActionKind.PageDown, extend: shiftHeld };
    case EmacsTextKey.D:
      return edit(EmacsTextEdit.DeleteForward);
    case EmacsTextKey.H:
      return edit(EmacsTextEdit.DeleteBackward);
    case EmacsTextKey.K:
      return edit(EmacsTextEdit.KillToParagraphEnd);
    case EmacsTextKey.L:
      return edit(EmacsTextEdit.CenterCaret);
    case EmacsTextKey.O:
      return edit(EmacsTextEdit.OpenLine);
    case EmacsTextKey.T:
      return edit(EmacsTextEdit.Transpose);
    case EmacsTextKey.Y:
      return edit(EmacsTextEdit.Yank);
  }
}

/** The parts of a keydown that decide whether it is an Emacs text key the browser left undone. */
export interface EmacsTextKeydown {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
}

const ASCII_LETTER = /^[a-zA-Z]$/;
const LETTER_CODE = /^Key([A-Z])$/;

/**
 * The Emacs text key a browser keydown carries that the browser itself will
 * not perform, or null when the page should leave the keydown alone.
 *
 * Chrome on macOS performs Ctrl+A/B/F/E and the rest natively only while the
 * input source is a Latin layout. Under a non-Latin one (Korean 2-set, for
 * instance) `key` is the layout's character (the Hangul jamo U+3160 for Ctrl+B) while `code`
 * still names the physical key (`'KeyB'`), and Chrome does nothing. The letter
 * is therefore read from `code`.
 *
 * When `key` is a single ASCII letter the browser performs the binding itself,
 * so acting here as well would apply every edit twice; that keydown returns
 * null. Cmd or Option alongside Ctrl, or a keydown inside an IME composition,
 * is a different key and also returns null.
 */
export function emacsTextKeyFromKeydown(event: EmacsTextKeydown): EmacsTextKeyPress | null {
  if (!event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.isComposing) return null;
  if (ASCII_LETTER.test(event.key)) return null;

  const letter = event.code ? LETTER_CODE.exec(event.code)?.[1] : undefined;
  if (!letter) return null;

  const key = parseEmacsTextKey(letter.toLowerCase());
  if (!key) return null;

  return { key, shift: event.shiftKey };
}
