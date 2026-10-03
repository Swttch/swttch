import { hasCmdOrCtrl } from '@/hooks/useZoomControls';

/**
 * Is this keydown the one that opens and closes the help modal?
 *
 * Cmd+/ on macOS and Ctrl+/ elsewhere, nothing else held: Shift would make it
 * the '?' key's own shortcut, and Option or Alt types a character on some
 * layouts. Matched on the typed character or the physical key, so a layout that
 * puts '/' somewhere else still reaches it. Ignored while the key is held, so
 * the OS repeat does not flip the modal open and shut.
 */
export function isHelpShortcut(e: KeyboardEvent): boolean {
  return (
    hasCmdOrCtrl(e) &&
    !e.shiftKey &&
    !e.altKey &&
    !e.repeat &&
    (e.key === '/' || e.code === 'Slash')
  );
}
