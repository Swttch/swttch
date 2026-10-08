import { hasCmdOrCtrl } from '@/hooks/useZoomControls';

/**
 * Is this keydown the one that opens and closes the side-question window?
 *
 * Cmd+Shift+B on macOS, Ctrl+Shift+B elsewhere — B for "by the way". Matched on
 * the physical key as well as the character, so a non-Latin layout or an IME
 * (where B types something else) still reaches it. Ignored while held, so the
 * OS repeat does not flip the window open and shut.
 */
export function isSideQuestionShortcut(e: KeyboardEvent): boolean {
  return (
    hasCmdOrCtrl(e) &&
    e.shiftKey &&
    !e.altKey &&
    !e.repeat &&
    (e.code === 'KeyB' || e.key === 'b' || e.key === 'B')
  );
}
