import { rectMetrics } from '@/utils/zoomRects';

/**
 * Insert plain text, of one line or many, in place of the current selection of a
 * focused contentEditable, as one edit the browser records in its undo history.
 *
 * The one way our code puts text into the composer, because the obvious command
 * loses line breaks: Chromium does not treat a `\n` handed to `insertText` as
 * one. It wraps the rest in a `<div>`, so a `plaintext-only` editable given
 * "a\nb" holds `a<div>b</div>` and has the textContent "ab". The composer reads
 * its value from textContent, so the screen showed the lines run together and the
 * message was sent that way (#430, #751).
 *
 * - One line goes through `insertText`.
 * - Several lines go through `insertHTML` with the text escaped, which leaves real
 *   "\n" characters, is one undo step, and takes milliseconds for thousands of
 *   lines. When that text ends with a line break and goes to the very end of the
 *   editable, one more "\n" follows it, as Enter leaves one: a final "\n" draws
 *   no line of its own, so the caret stayed before it and what was typed next
 *   landed on the line above.
 * - Where the browser declines `insertHTML`, the lines are written one by one with
 *   `insertText` and `insertLineBreak`. That keeps the breaks too, but it is slow
 *   for long text (about ten seconds for three thousand lines).
 *
 * The caret is scrolled into view afterwards. The browser does that for a paste of
 * its own and not for an insert from script, so long text left the box showing its
 * first lines while the caret sat far below.
 *
 * Returns whether the browser performed the edit. `false` means no native `input`
 * event will follow (execCommand is unavailable in jsdom, and can be disabled
 * elsewhere).
 */
export function insertTextAtCursor(text: string): boolean {
  // "\n" is the one line ending the composer counts; a clipboard may carry others.
  const normalized = text.replace(/\r\n?/g, '\n');
  try {
    if (!write(normalized)) return false;
  } catch {
    return false;
  }
  revealCaret();
  return true;
}

function write(text: string): boolean {
  if (!text.includes('\n')) return document.execCommand('insertText', false, text);
  const caretLine = text.endsWith('\n') && textAfterSelection()?.rest === '' ? '\n' : '';
  if (document.execCommand('insertHTML', false, escapeHtml(text + caretLine))) return true;
  return insertLineByLine(text);
}

/** The editable holding the selection, and the text that follows the selection in it. */
function textAfterSelection(): { editable: Element; rest: string } | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const { endContainer, endOffset } = selection.getRangeAt(0);
  const element = endContainer instanceof Element ? endContainer : endContainer.parentElement;
  const editable = element?.closest('[contenteditable]');
  if (!editable) return null;
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.setStart(endContainer, endOffset);
  return { editable, rest: range.toString() };
}

/** Scroll the editable, by as little as it takes, so the caret can be seen. */
function revealCaret(): void {
  const after = textAfterSelection();
  if (!after) return;
  const { editable, rest } = after;
  // At the end of the text (a lone "\n" there is the caret's own line), the bottom is the place.
  if (rest === '' || rest === '\n') {
    editable.scrollTop = editable.scrollHeight;
    return;
  }
  const caret = document.getSelection()?.getRangeAt(0).getClientRects?.()[0];
  if (!caret) return;
  const box = editable.getBoundingClientRect();
  // A rectangle's pixels are not the scroll position's under the page zoom.
  const { toFixed } = rectMetrics();
  if (caret.bottom > box.bottom) editable.scrollTop += toFixed(caret.bottom - box.bottom);
  else if (caret.top < box.top) editable.scrollTop -= toFixed(box.top - caret.top);
}

/** Text as HTML source that reads back as the same characters. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The slower way in: `insertLineBreak` is the command a single Enter already uses. */
function insertLineByLine(text: string): boolean {
  const lines = text.split('\n');
  // The first segment also deletes the selected range, including when it is
  // empty (measured: insertText with "" returns true and clears the range).
  if (!document.execCommand('insertText', false, lines[0] ?? '')) return false;

  for (let index = 1; index < lines.length; index++) {
    if (!document.execCommand('insertLineBreak')) return false;
    const line = lines[index] as string;
    if (line !== '' && !document.execCommand('insertText', false, line)) return false;
  }
  return true;
}
