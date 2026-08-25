import { CaretBoundary, CaretDirection } from '@/utils/domSelection';

/** The move a Cmd+Arrow press asks for. */
export interface CaretBoundaryMove {
  direction: CaretDirection;
  boundary: CaretBoundary;
  /** Shift was held, so drag the selection's end rather than move the caret. */
  extend: boolean;
}

/** The parts of a keydown this decision reads. */
export interface CaretBoundaryKeyEvent {
  key: string;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/**
 * Which caret move a keydown asks for, or null when the composer should keep
 * its hands off the key.
 *
 * Split out from the composer's keydown handler so the mapping can be asserted
 * on its own — rendering ChatInput takes a dozen contexts, and a test that
 * heavy would not be written per key combination.
 *
 * Only Cmd is claimed. Option+Arrow is Chromium's own word-wise movement and
 * works under off-screen rendering, so taking it over here would replace a
 * working behaviour with a reimplementation of it. Ctrl+Arrow belongs to macOS
 * (Mission Control) and to the IDE elsewhere.
 */
export function caretBoundaryMoveFor(e: CaretBoundaryKeyEvent): CaretBoundaryMove | null {
  if (!e.metaKey || e.altKey || e.ctrlKey) return null;

  switch (e.key) {
    case 'ArrowLeft':
      return {
        direction: CaretDirection.Backward,
        boundary: CaretBoundary.Line,
        extend: e.shiftKey,
      };
    case 'ArrowRight':
      return {
        direction: CaretDirection.Forward,
        boundary: CaretBoundary.Line,
        extend: e.shiftKey,
      };
    // Up and Down reach the whole text, which is what macOS does with them.
    //
    // Cmd+Up does not arrive inside a JetBrains IDE: `meta UP` is ShowNavBar in
    // the bundled macOS keymap, and the IDE opens the navigation bar — taking
    // focus off the page — before the keystroke is ours to read. Reaching it
    // would mean telling CEF to stop treating arrows as IDE shortcuts at all
    // (WebViewKeyboardHandler), and that switch is not scoped to this input:
    // it would take the arrows away from every other thing the panel hosts.
    // Not worth it for one key, so Cmd+Up is knowingly left broken there.
    //
    // The mapping stays because the browser build has no such competitor and
    // Cmd+Up works there; deleting it would break the case that works to match
    // the one that cannot.
    case 'ArrowUp':
      return {
        direction: CaretDirection.Backward,
        boundary: CaretBoundary.Document,
        extend: e.shiftKey,
      };
    case 'ArrowDown':
      return {
        direction: CaretDirection.Forward,
        boundary: CaretBoundary.Document,
        extend: e.shiftKey,
      };
    default:
      return null;
  }
}
