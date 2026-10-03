import type { TextRange } from '@/utils/domSelection';

/**
 * Pure offset math behind the macOS Emacs text keys (issue #506): which span of
 * a field's text each edit touches, given the text and the selection as
 * character offsets. Nothing here reads or writes the DOM, so every rule can be
 * asserted on strings; emacsTextEdit applies the results.
 *
 * "Paragraph" means the run of text between hard newlines, which is what the
 * macOS selectors (`deleteToEndOfParagraph:` and friends) act on. A character
 * step never splits a UTF-16 surrogate pair, so an emoji counts as one
 * character the way the caret already treats it.
 */

/** A replacement of `[start, end)` by `text`, with where the caret rests afterwards. */
export interface TextReplacement {
  start: number;
  end: number;
  text: string;
  caret: number;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** The offset one character after `offset`, clamped to the end of `text`. */
export function nextCharacterEnd(text: string, offset: number): number {
  if (offset >= text.length) return text.length;
  if (isHighSurrogate(text.charCodeAt(offset)) && isLowSurrogate(text.charCodeAt(offset + 1))) {
    return offset + 2;
  }
  return offset + 1;
}

/** The offset one character before `offset`, clamped to 0. */
export function previousCharacterStart(text: string, offset: number): number {
  if (offset <= 0) return 0;
  if (offset >= 2 && isLowSurrogate(text.charCodeAt(offset - 1)) && isHighSurrogate(text.charCodeAt(offset - 2))) {
    return offset - 2;
  }
  return offset - 1;
}

function isCollapsed(selection: TextRange): boolean {
  return selection.start === selection.end;
}

/**
 * Ctrl+D (`deleteForward:`): the selection when there is one, otherwise the
 * character after the caret; null at the very end, where there is nothing to
 * delete.
 */
export function deleteForwardRange(text: string, selection: TextRange): TextRange | null {
  if (!isCollapsed(selection)) return selection;
  const caret = selection.start;
  if (caret >= text.length) return null;
  return { start: caret, end: nextCharacterEnd(text, caret) };
}

/**
 * Ctrl+H (`deleteBackward:`): the selection when there is one, otherwise the
 * character before the caret; null at the very start.
 */
export function deleteBackwardRange(text: string, selection: TextRange): TextRange | null {
  if (!isCollapsed(selection)) return selection;
  const caret = selection.start;
  if (caret <= 0) return null;
  return { start: previousCharacterStart(text, caret), end: caret };
}

/**
 * Ctrl+K (`deleteToEndOfParagraph:`): from the caret to the end of its
 * paragraph. With the caret already at the paragraph's end the span is the
 * line break after it, so a second Ctrl+K joins the next line on, as macOS
 * does. Null at the very end of the text.
 *
 * A non-collapsed selection is killed as it stands: the user marked exactly
 * what to take, and cutting from one of its edges instead would leave half of
 * the marked text behind.
 */
export function killRange(text: string, selection: TextRange): TextRange | null {
  if (!isCollapsed(selection)) return selection;
  const caret = selection.start;
  if (caret >= text.length) return null;
  const lineBreak = text.indexOf('\n', caret);
  const paragraphEnd = lineBreak === -1 ? text.length : lineBreak;
  if (paragraphEnd > caret) return { start: caret, end: paragraphEnd };
  // At the paragraph's end the next character is the line break itself.
  return { start: caret, end: caret + 1 };
}

/**
 * Ctrl+T (`transpose:`): swap the character before the caret with the one
 * after it, leaving the caret after the pair. At the end of a paragraph, where
 * there is no character after the caret on the same line, the two characters
 * before the caret are swapped instead, so repeated Ctrl+T at a line's end
 * keeps fixing the last typo.
 *
 * Null, meaning nothing happens, when:
 * - the selection is not collapsed (which pair to swap is then ambiguous);
 * - fewer than two characters are available on the caret's paragraph, which
 *   covers the caret at the very start of the text or of a paragraph;
 * - the pair would include a line break: a swap across lines would move text
 *   between paragraphs, which no one means by "fix the typo".
 */
export function transposeReplacement(text: string, selection: TextRange): TextReplacement | null {
  if (!isCollapsed(selection)) return null;
  const caret = selection.start;
  const atParagraphEnd = caret >= text.length || text[caret] === '\n';

  let middle: number;
  let end: number;
  if (atParagraphEnd) {
    middle = previousCharacterStart(text, caret);
    end = caret;
  } else {
    middle = caret;
    end = nextCharacterEnd(text, caret);
  }
  const start = previousCharacterStart(text, middle);
  if (start === middle || middle === end) return null;

  const first = text.slice(start, middle);
  const second = text.slice(middle, end);
  if (first === '\n' || second === '\n') return null;
  return { start, end, text: second + first, caret: end };
}

/**
 * Ctrl+Y (`yank:`): the killed text replaces the selection, caret after it.
 * Null when nothing has been killed yet.
 */
export function yankReplacement(selection: TextRange, killed: string): TextReplacement | null {
  if (killed === '') return null;
  return { start: selection.start, end: selection.end, text: killed, caret: selection.start + killed.length };
}

/**
 * Ctrl+O (`insertNewlineIgnoringFieldEditor:` then `moveBackward:`): a line
 * break replaces the selection and the caret stays in front of it, so the text
 * after the caret drops to a new line while typing continues on this one.
 */
export function openLineReplacement(selection: TextRange): TextReplacement {
  return { start: selection.start, end: selection.end, text: '\n', caret: selection.start };
}

/**
 * How many rows Ctrl+V (`pageDown:`) moves: the rows that fit wholly in the
 * visible height, and at least one so the key always does something. A line
 * height that could not be read (zero, negative or NaN) counts as one row.
 */
export function pageRowCount(visibleHeight: number, lineHeight: number): number {
  if (!(lineHeight > 0) || !(visibleHeight > 0)) return 1;
  return Math.max(1, Math.floor(visibleHeight / lineHeight));
}

/**
 * The `scrollTop` change that puts a caret in the middle of a viewport, for
 * Ctrl+L (`centerSelectionInVisibleArea:`). `caretTop` is measured from the
 * viewport's top edge; positive results scroll down. The scroller clamps the
 * result to what it can actually reach.
 */
export function centeringScrollDelta(caretTop: number, caretHeight: number, viewportHeight: number): number {
  return caretTop + caretHeight / 2 - viewportHeight / 2;
}

/** How many hard line breaks come before `offset`: the caret's line index in a textarea. */
export function lineIndexAt(text: string, offset: number): number {
  let count = 0;
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text[index] === '\n') count++;
  }
  return count;
}
