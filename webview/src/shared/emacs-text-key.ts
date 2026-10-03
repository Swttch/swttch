/**
 * The letters of the macOS Emacs-style text keys (Ctrl+letter bindings that
 * macOS gives every native text field), as they travel in the payload of
 * `MessageType.EMACS_TEXT_KEY_PRESSED`.
 *
 * Under JCEF off-screen rendering on macOS the page receives every Ctrl+letter
 * as Ctrl+A, so only the IDE can say which letter was pressed. It names the
 * letter, the backend routes it to the panel, and the webview performs the
 * binding.
 *
 * The set is exactly the Ctrl+letter entries of AppKit's
 * `StandardKeyBinding.dict`. Each comment names the selector macOS binds.
 *
 * NOTE: This file is mirrored 1:1 between `backend/src/shared/` and
 * `webview/src/shared/`. Any edit here MUST be copied there (see `shared/CLAUDE.md`).
 */
export enum EmacsTextKey {
  /** Ctrl+A: moveToBeginningOfParagraph, start of the paragraph. */
  A = 'a',
  /** Ctrl+B: moveBackward, one character back. */
  B = 'b',
  /** Ctrl+D: deleteForward, delete the character after the caret. */
  D = 'd',
  /** Ctrl+E: moveToEndOfParagraph, end of the paragraph. */
  E = 'e',
  /** Ctrl+F: moveForward, one character forward. */
  F = 'f',
  /** Ctrl+H: deleteBackward, delete the character before the caret. */
  H = 'h',
  /** Ctrl+K: deleteToEndOfParagraph, cut to the end of the paragraph into the kill buffer. */
  K = 'k',
  /** Ctrl+L: centerSelectionInVisibleArea, scroll so the caret sits mid-view. */
  L = 'l',
  /** Ctrl+N: moveDown, one row down. */
  N = 'n',
  /** Ctrl+O: insertNewlineIgnoringFieldEditor then moveBackward, open a line. */
  O = 'o',
  /** Ctrl+P: moveUp, one row up. */
  P = 'p',
  /** Ctrl+T: transpose, swap the characters around the caret. */
  T = 't',
  /** Ctrl+V: pageDown, move the caret down one page. */
  V = 'v',
  /** Ctrl+Y: yank, insert the kill buffer. */
  Y = 'y',
}

const EMACS_TEXT_KEYS: ReadonlySet<string> = new Set(Object.values(EmacsTextKey));

/**
 * The key a payload names, or null when it names none of them. Exact match
 * only: no case folding or trimming, because the IDE sends exactly these
 * values and anything else is a malformed message to drop.
 */
export function parseEmacsTextKey(value: string): EmacsTextKey | null {
  return EMACS_TEXT_KEYS.has(value) ? (value as EmacsTextKey) : null;
}

/** What `MessageType.EMACS_TEXT_KEY_PRESSED` carries: the letter and whether Shift was held. */
export interface EmacsTextKeyPress {
  key: EmacsTextKey;
  shift: boolean;
}

/**
 * The press a payload describes, or null when its key names none of the
 * fourteen letters. `shift` is true only for the JSON boolean `true`; absent
 * or of any other type it reads as false, so a payload from an older sender
 * without it still moves the caret instead of being dropped.
 */
export function parseEmacsTextKeyPress(payload: { key?: unknown; shift?: unknown }): EmacsTextKeyPress | null {
  const key = typeof payload.key === 'string' ? parseEmacsTextKey(payload.key) : null;
  if (!key) return null;
  return { key, shift: payload.shift === true };
}
