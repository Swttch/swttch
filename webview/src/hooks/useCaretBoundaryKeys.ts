import { useEffect } from 'react';
import { isMac } from '@/config/environment';
import { typingTargetOf } from '@/utils/typingTarget';
import { CaretBoundary, CaretDirection, moveCaretToBoundary } from '@/utils/domSelection';
import { caretBoundaryMoveFor } from '@/utils/caretBoundaryKey';

/**
 * Cmd+Arrow caret movement for every text field in the app, on macOS.
 *
 * Under JCEF's off-screen rendering — the default since IDE 2025.1, so what
 * most users are on — Chromium performs no such move. On macOS these are not
 * Chromium's own shortcuts: they arrive as NSResponder selectors
 * (`moveToBeginningOfLine:` and friends) that the OS sends to a native view,
 * and OSR has none. The keystroke reaches the page with its modifiers intact
 * and nothing prevents it, and then the caret simply does not move.
 *
 * Option+Arrow is untouched: word-wise movement *is* built into Chromium and
 * keeps working. That asymmetry is what identified the cause, and claiming
 * Option here would replace something that works with a reimplementation.
 *
 * Registered once at the app root rather than per field. Every input is missing
 * the same behaviour for the same reason, and wiring them one at a time would
 * leave the next one added broken again.
 *
 * The listener runs in the capture phase so it settles the key before a field's
 * own handler reads it — the composer's history navigation, for one, acts on a
 * bare ArrowUp and must not see a Cmd+ArrowUp that means "go to the top".
 */
export function useCaretBoundaryKeys(): void {
  useEffect(() => {
    // Windows and Linux have no such binding to restore: Ctrl+Arrow is word-wise
    // there (Chromium's own) and Home/End do the line, both of which work.
    if (!isMac()) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const move = caretBoundaryMoveFor(e);
      if (!move) return;

      const target = typingTargetOf(e);
      if (!target) return;

      // A form field keeps its selection in character offsets, and
      // `Selection.modify` does not reach inside one.
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        e.preventDefault();
        moveFormFieldCaret(target, move.direction, move.boundary, move.extend);
        return;
      }

      e.preventDefault();
      moveCaretToBoundary(target, move.direction, move.boundary, move.extend);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}

/**
 * The same move inside an `<input>` or `<textarea>`.
 *
 * A single-line `<input>` has one line, so its line edges and its text's edges
 * are the same positions — both granularities collapse to offset 0 or the
 * length, which is what macOS does there too.
 *
 * A `<textarea>` wraps, and its visual rows cannot be found from the value:
 * where a row breaks is a layout fact, and the value only records the hard
 * newlines. The line edge is taken as the paragraph's edge, which is exact for
 * text that has not wrapped and is the closest reachable answer for text that
 * has. The composer is a contentEditable and so takes the exact path above;
 * this is for the plain textareas elsewhere in the app.
 */
function moveFormFieldCaret(
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

  let next: number;
  if (boundary === CaretBoundary.Document) {
    next = backward ? 0 : value.length;
  } else if (backward) {
    next = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  } else {
    const nextBreak = value.indexOf('\n', caret);
    next = nextBreak === -1 ? value.length : nextBreak;
  }

  if (!extend) {
    field.setSelectionRange(next, next);
    return;
  }

  // Keep the anchor — the end the user started from — and drag the other.
  const anchor = field.selectionDirection === 'backward'
    ? (field.selectionEnd ?? 0)
    : (field.selectionStart ?? 0);
  field.setSelectionRange(
    Math.min(anchor, next),
    Math.max(anchor, next),
    next < anchor ? 'backward' : 'forward',
  );
}
