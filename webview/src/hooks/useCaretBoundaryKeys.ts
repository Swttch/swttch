import { useEffect } from 'react';
import { isMac } from '@/config/environment';
import { typingTargetOf } from '@/utils/typingTarget';
import { moveCaretToBoundary } from '@/utils/domSelection';
import { caretBoundaryMoveFor } from '@/utils/caretBoundaryKey';
import { moveFormFieldCaret } from '@/utils/formFieldCaret';

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
 * The Emacs-style Ctrl keys (Ctrl+A/B/D/E/F/H/K/L/N/O/P/T/V/Y) are not handled
 * here: under OSR every Ctrl+letter reaches the page as Ctrl+A, so a keydown
 * cannot tell them apart. The IDE reads the real letter and sends it over the bridge instead;
 * see useEmacsTextKeys.
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
