import { escapeHtml } from '@/utils/markdownParser';
import { normalizeNewlines } from '@/utils/hostPaste';

/** A text field of the page that is not the composer. */
export type TextField = HTMLInputElement | HTMLTextAreaElement;

/**
 * Put text in place of the selection of a focused input or textarea, as one edit of
 * its own in the browser's undo history, apart from the typing on either side.
 *
 * - An input takes `insertText`, which turns line breaks into spaces as a paste does.
 * - A textarea takes text of several lines through `insertHTML` with the text
 *   escaped. `insertText` keeps the lines too, but fires an `input` event per line
 *   and took about ten seconds for three thousand lines, against 60 ms.
 *
 * The browser neither scrolls a field to the caret after an insert from script nor,
 * after `insertHTML`, leaves the caret behind a final line break, so both are done here.
 *
 * Returns whether the browser performed the edit.
 */
export function insertTextIntoField(field: TextField, text: string): boolean {
  const normalized = normalizeNewlines(text);
  // What follows the selection stays, so the caret belongs right before it. Number and
  // email fields tell no selection at all, and need no help placing the caret.
  const tail = field.selectionEnd === null ? null : field.value.length - field.selectionEnd;

  endTypingRun(field);
  try {
    const asLines = field instanceof HTMLTextAreaElement && normalized.includes('\n');
    const done = (asLines && document.execCommand('insertHTML', false, escapeHtml(normalized)))
      || document.execCommand('insertText', false, normalized);
    if (!done) return false;
  } catch {
    return false;
  }

  if (tail !== null) {
    const caret = field.value.length - tail;
    field.setSelectionRange(caret, caret);
  }
  revealCaret(field);
  return true;
}

/**
 * End the run of typing the browser is still counting as one edit. Setting the
 * selection to where it already is does that for a field; resetting the document's
 * selection, which works for the composer, makes the next insert into a field fail.
 */
function endTypingRun(field: TextField): void {
  const { selectionStart, selectionEnd } = field;
  if (selectionStart === null || selectionEnd === null) return;
  field.setSelectionRange(selectionStart, selectionEnd);
}

/** Scroll the field, if it has to, so the caret can be seen. */
function revealCaret(field: TextField): void {
  const caret = field.selectionStart;
  if (caret === null) return;
  if (field instanceof HTMLInputElement) {
    if (caret === field.value.length) field.scrollLeft = field.scrollWidth;
    return;
  }
  if (caret === field.value.length) {
    field.scrollTop = field.scrollHeight;
    return;
  }
  // A textarea does not say where its caret is. A copy of it holding only the text up
  // to the caret is exactly as tall as the caret is far down.
  const probe = field.cloneNode() as HTMLTextAreaElement;
  probe.value = field.value.slice(0, caret);
  Object.assign(probe.style, {
    position: 'absolute',
    visibility: 'hidden',
    height: '0',
    minHeight: '0',
    width: `${field.offsetWidth}px`,
  });
  field.after(probe);
  const caretBottom = probe.scrollHeight;
  probe.remove();
  if (caretBottom > field.scrollTop + field.clientHeight) {
    field.scrollTop = caretBottom - field.clientHeight;
  }
}
