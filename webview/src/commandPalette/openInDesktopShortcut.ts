import { hasCmdOrCtrl } from '@/hooks/useZoomControls';

/**
 * Is this keydown the open-in-Claude-Desktop shortcut: Cmd+Option+Shift+O on macOS, Ctrl+Alt+Shift+O elsewhere?
 *
 * Shift is part of it on purpose. Cmd+Option+O alone is "Go to Symbol" in a JetBrains IDE, which opened its search box
 * on top of the confirmation, and Cmd+Option+J is the browser's developer console. The IDE's keymaps (macOS and
 * Windows/Linux, 2024.2 and 2026.3) bind nothing to the combination with Shift, and neither does Chrome.
 *
 * Matched on the physical key, because Option+O types a character on macOS ('ø') and `key` is that character.
 * Ignored while held, so the OS repeat does not ask again while the confirmation is open.
 */
export function isOpenInDesktopShortcut(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && e.altKey && e.shiftKey && !e.repeat && e.code === 'KeyO';
}
