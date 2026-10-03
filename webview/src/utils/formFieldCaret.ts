import { CaretBoundary, CaretDirection } from '@/utils/domSelection';

/**
 * Move (or extend the selection by) one caret step inside an `<input>` or
 * `<textarea>`, the counterpart of `moveCaretToBoundary` for form fields.
 * A form field keeps its selection in character offsets, and `Selection.modify`
 * does not reach inside one.
 *
 * A single-line `<input>` has one line, so its line edges and its text's edges
 * are the same positions: every granularity but Character collapses to offset 0
 * or the length, which is what macOS does there too.
 *
 * A `<textarea>` wraps, and its visual rows cannot be found from the value:
 * where a row breaks is a layout fact, and the value only records the hard
 * newlines. The line edge is taken as the paragraph's edge, which is exact for
 * text that has not wrapped and is the closest reachable answer for text that
 * has. Row (one row up or down) inherits the same compromise: a row is a hard
 * line, so a wrapped line is one row to it. The composer is a contentEditable
 * and so takes the exact `Selection.modify` path; this is for the plain inputs
 * and textareas elsewhere in the app.
 *
 * @param extend Keep the selection's anchor and drag its end (Shift is held).
 */
export function moveFormFieldCaret(
  field: HTMLInputElement | HTMLTextAreaElement,
  direction: CaretDirection,
  boundary: CaretBoundary,
  extend: boolean,
): void {
  const value = field.value;
  const backward = direction === CaretDirection.Backward;
  // The end being moved is the one the caret sits at, which `selectionDirection`
  // tells apart for a selection made with Shift.
  const caret = (field.selectionDirection === 'backward' ? field.selectionStart : field.selectionEnd) ?? 0;

  const selStart = field.selectionStart ?? 0;
  const selEnd = field.selectionEnd ?? 0;
  const isTextarea = field instanceof HTMLTextAreaElement;
  const lineStartOf = (pos: number) => (pos === 0 ? 0 : value.lastIndexOf('\n', pos - 1) + 1);
  const lineEndOf = (pos: number) => {
    const nextBreak = value.indexOf('\n', pos);
    return nextBreak === -1 ? value.length : nextBreak;
  };

  let next: number;
  if (boundary === CaretBoundary.Document) {
    next = backward ? 0 : value.length;
  } else if (boundary === CaretBoundary.Character) {
    // Without Shift a selection collapses to its near edge instead of stepping
    // from the caret, as macOS does.
    if (!extend && selStart !== selEnd) {
      next = backward ? selStart : selEnd;
    } else {
      next = Math.max(0, Math.min(value.length, caret + (backward ? -1 : 1)));
    }
  } else if (boundary === CaretBoundary.Row) {
    // An <input> is one row, so up and down reach its ends. In a <textarea> a
    // row is taken to be a hard line (see above): same column on the
    // neighbouring line, clamped to its length, and the text's edge when there
    // is no neighbour.
    if (!isTextarea) {
      next = backward ? 0 : value.length;
    } else {
      const start = lineStartOf(caret);
      const column = caret - start;
      if (backward) {
        if (start === 0) {
          next = 0;
        } else {
          const prevStart = lineStartOf(start - 1);
          next = prevStart + Math.min(column, start - 1 - prevStart);
        }
      } else {
        const end = lineEndOf(caret);
        if (end === value.length) {
          next = value.length;
        } else {
          const nextStart = end + 1;
          next = nextStart + Math.min(column, lineEndOf(nextStart) - nextStart);
        }
      }
    }
  } else if (backward) {
    // Line and Paragraph: the hard-newline edge, see above.
    next = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  } else {
    next = lineEndOf(caret);
  }

  if (!extend) {
    field.setSelectionRange(next, next);
    return;
  }

  // Keep the anchor (the end the user started from) and drag the other.
  const anchor = field.selectionDirection === 'backward'
    ? (field.selectionEnd ?? 0)
    : (field.selectionStart ?? 0);
  field.setSelectionRange(
    Math.min(anchor, next),
    Math.max(anchor, next),
    next < anchor ? 'backward' : 'forward',
  );
}
