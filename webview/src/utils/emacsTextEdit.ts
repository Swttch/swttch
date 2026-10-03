import { EmacsTextKey } from '@/shared';
import {
  CaretBoundary,
  CaretDirection,
  getSelectionRange,
  moveCaretToBoundary,
  setCaretOffset,
  type TextRange,
} from '@/utils/domSelection';
import { moveFormFieldCaret } from '@/utils/formFieldCaret';
import { EmacsTextActionKind, EmacsTextEdit, emacsTextActionFor } from '@/utils/emacsTextKey';
import {
  centeringScrollDelta,
  deleteBackwardRange,
  deleteForwardRange,
  killRange,
  lineIndexAt,
  openLineReplacement,
  pageRowCount,
  transposeReplacement,
  yankReplacement,
  type TextReplacement,
} from '@/utils/emacsTextRange';
import { killRing } from '@/utils/killRing';
import { replaceRangeWithText } from '@/pages/ChatPage/ChatInput/RichInput/replaceRangeWithText';

type FormField = HTMLInputElement | HTMLTextAreaElement;

function isFormField(target: HTMLElement): target is FormField {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/**
 * Perform a macOS Emacs-style text key (issue #506) in the focused editable
 * `target`: an `<input>`, a `<textarea>` or a contentEditable such as the
 * composer.
 *
 * Edits go through `document.execCommand` on the exact span, so the browser
 * records them in its undo history and fires the native `input` event that
 * keeps React's state in step, the same pipeline the composer uses for
 * autocomplete (replaceRangeWithText). Where execCommand is missing or refuses
 * (jsdom has none), a form field falls back to `setRangeText` plus a bubbling
 * `input` event, which React also hears but which cannot be undone with Cmd+Z;
 * a contentEditable falls back to doing nothing, because editing its DOM behind
 * the browser's back would desynchronise the composer's value and its history.
 *
 * Offsets in a contentEditable are `textContent` offsets. That is exact for the
 * composer, a `plaintext-only` editable whose line breaks are `\n` characters
 * in its text, and approximate for an editable that breaks lines with elements.
 *
 * @param shiftHeld Shift was held, as the IDE read it from its key event.
 */
export function applyEmacsTextKey(target: HTMLElement, key: EmacsTextKey, shiftHeld: boolean): void {
  // Only Ctrl+K pressed again right after Ctrl+K appends to the kill ring.
  if (key !== EmacsTextKey.K) killRing.breakSequence();

  const action = emacsTextActionFor(key, shiftHeld);
  if (!action) return;

  switch (action.kind) {
    case EmacsTextActionKind.Move: {
      const { direction, boundary, extend } = action.move;
      // A form field keeps its selection in character offsets, and
      // `Selection.modify` does not reach inside one.
      if (isFormField(target)) {
        moveFormFieldCaret(target, direction, boundary, extend);
      } else {
        moveCaretToBoundary(target, direction, boundary, extend);
      }
      return;
    }
    case EmacsTextActionKind.PageDown:
      pageDown(target, action.extend);
      return;
    case EmacsTextActionKind.Edit:
      applyEdit(target, action.edit);
      return;
  }
}

function applyEdit(target: HTMLElement, edit: EmacsTextEdit): void {
  if (edit === EmacsTextEdit.CenterCaret) {
    centerCaret(target);
    return;
  }

  const editable = isFormField(target) ? new FormFieldText(target) : new ContentEditableText(target);
  const text = editable.text();
  const selection = editable.selection();

  switch (edit) {
    case EmacsTextEdit.DeleteForward:
    case EmacsTextEdit.DeleteBackward: {
      const forward = edit === EmacsTextEdit.DeleteForward;
      // The browser's own delete knows grapheme clusters, so it goes first.
      if (editable.deleteNatively(forward)) return;
      // A contentEditable has no fallback (see above); a form field does.
      if (!isFormField(target)) return;
      const range = forward ? deleteForwardRange(text, selection) : deleteBackwardRange(text, selection);
      if (range) editable.replace({ start: range.start, end: range.end, text: '', caret: range.start });
      return;
    }
    case EmacsTextEdit.KillToParagraphEnd: {
      const range = killRange(text, selection);
      if (!range) return;
      const killed = text.slice(range.start, range.end);
      if (!editable.replace({ start: range.start, end: range.end, text: '', caret: range.start })) return;
      killRing.recordKill(target, killed, range.start, text, text.slice(0, range.start) + text.slice(range.end));
      return;
    }
    case EmacsTextEdit.Yank: {
      const replacement = yankReplacement(selection, killRing.text());
      if (replacement) editable.replace(replacement);
      return;
    }
    case EmacsTextEdit.OpenLine:
      // A single-line input has no second line to open; the browser would drop
      // the line break anyway.
      if (target instanceof HTMLInputElement) return;
      editable.replace(openLineReplacement(selection));
      return;
    case EmacsTextEdit.Transpose: {
      const replacement = transposeReplacement(text, selection);
      if (replacement) editable.replace(replacement);
      return;
    }
  }
}

/** The text of one editable, read and written as character offsets. */
interface EditableText {
  text(): string;
  selection(): TextRange;
  /** Apply a replacement. Returns whether the text was changed (or there was nothing to change). */
  replace(replacement: TextReplacement): boolean;
  /** Let the browser delete around the current selection. Returns whether it did. */
  deleteNatively(forward: boolean): boolean;
}

/** `document.execCommand`, or false when it is missing or throws. */
function execCommand(command: string, value?: string): boolean {
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

class FormFieldText implements EditableText {
  constructor(private readonly field: FormField) {}

  text(): string {
    return this.field.value;
  }

  selection(): TextRange {
    return { start: this.field.selectionStart ?? 0, end: this.field.selectionEnd ?? 0 };
  }

  replace({ start, end, text, caret }: TextReplacement): boolean {
    if (start === end && text === '') return true;
    this.field.setSelectionRange(start, end);
    // In a form field `insertText` keeps a "\n" as a line break; only the
    // contentEditable composer turns it into a wrapper element.
    const done = text === '' ? execCommand('delete') : execCommand('insertText', text);
    if (!done) {
      this.field.setRangeText(text, start, end, 'end');
      this.field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    this.field.setSelectionRange(caret, caret);
    return true;
  }

  deleteNatively(forward: boolean): boolean {
    return execCommand(forward ? 'forwardDelete' : 'delete');
  }
}

class ContentEditableText implements EditableText {
  constructor(private readonly root: HTMLElement) {}

  text(): string {
    return this.root.textContent ?? '';
  }

  selection(): TextRange {
    return getSelectionRange(this.root);
  }

  replace({ start, end, text, caret }: TextReplacement): boolean {
    if (start === end && text === '') return true;
    // Splits "\n" into insertLineBreak; a "\n" inside insertText is dropped
    // by the plaintext-only composer.
    if (!replaceRangeWithText(this.root, start, end, text)) return false;
    if (caret !== start + text.length) setCaretOffset(this.root, caret);
    return true;
  }

  deleteNatively(forward: boolean): boolean {
    return execCommand(forward ? 'forwardDelete' : 'delete');
  }
}

/** The CSS line height in pixels, from `normal` as 1.2 x the font size; 0 when unreadable. */
function lineHeightOf(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const lineHeight = parseFloat(style.lineHeight);
  if (lineHeight > 0) return lineHeight;
  const fontSize = parseFloat(style.fontSize);
  return fontSize > 0 ? fontSize * 1.2 : 0;
}

/**
 * Ctrl+V (`pageDown:`): the caret goes down as many rows as the field shows at
 * once, and the selection grows instead with Shift.
 *
 * macOS also scrolls the view by a page; here the caret moves and the field
 * scrolls only as far as keeping the caret visible requires, which lands on
 * the same text without a separate scroll step. A single-line `<input>` has
 * one row, so a page down reaches its end. A `<textarea>` counts hard lines as
 * rows (see moveFormFieldCaret). A contentEditable moves by visual rows; its
 * visible height is its own `clientHeight`, which is the whole text when the
 * composer has grown to fit it, so a page there can reach the end.
 */
function pageDown(target: HTMLElement, extend: boolean): void {
  if (target instanceof HTMLInputElement) {
    moveFormFieldCaret(target, CaretDirection.Forward, CaretBoundary.Document, extend);
    return;
  }
  const rows = pageRowCount(target.clientHeight, lineHeightOf(target));
  for (let row = 0; row < rows; row++) {
    if (target instanceof HTMLTextAreaElement) {
      moveFormFieldCaret(target, CaretDirection.Forward, CaretBoundary.Row, extend);
    } else {
      moveCaretToBoundary(target, CaretDirection.Forward, CaretBoundary.Row, extend);
    }
  }
}

/** The nearest element at or above `element` that scrolls vertically, else `element`. */
function verticalScrollerOf(element: HTMLElement): HTMLElement {
  let current: HTMLElement | null = element;
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return element;
}

/**
 * Ctrl+L (`centerSelectionInVisibleArea:`): scroll so the caret sits in the
 * middle of the visible area.
 *
 * - contentEditable: exact. The caret's rect is laid out by the engine and
 *   compared against the nearest vertical scroller. Where the composer is not
 *   taller than its scroller there is nothing to scroll and nothing happens.
 * - `<textarea>`: best effort. A form field exposes no caret rect, so the
 *   caret's height is taken as its hard-line index times the line height. Soft
 *   wrapping above the caret puts it lower than that, so a wrapped textarea
 *   centres a little above the caret.
 * - `<input>`: one row, nothing to centre.
 */
function centerCaret(target: HTMLElement): void {
  if (target instanceof HTMLInputElement) return;

  if (target instanceof HTMLTextAreaElement) {
    const lineHeight = lineHeightOf(target);
    if (lineHeight <= 0) return;
    const caret = (target.selectionDirection === 'backward' ? target.selectionStart : target.selectionEnd) ?? 0;
    const paddingTop = parseFloat(window.getComputedStyle(target).paddingTop) || 0;
    const caretTop = paddingTop + lineIndexAt(target.value, caret) * lineHeight - target.scrollTop;
    target.scrollTop += centeringScrollDelta(caretTop, lineHeight, target.clientHeight);
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const caret = selection.getRangeAt(0).cloneRange();
  if (selection.focusNode) caret.setStart(selection.focusNode, selection.focusOffset);
  caret.collapse(true);
  const caretRect = caret.getClientRects?.()?.[0] ?? caret.getBoundingClientRect?.();
  if (!caretRect) return;

  const scroller = verticalScrollerOf(target);
  const scrollerRect = scroller.getBoundingClientRect();
  // All-zero rects mean the environment does no layout: nothing to centre on.
  if (scrollerRect.width === 0 && scrollerRect.height === 0) return;
  const caretTop = caretRect.top - scrollerRect.top - scroller.clientTop;
  scroller.scrollTop += centeringScrollDelta(caretTop, caretRect.height, scroller.clientHeight);
}
