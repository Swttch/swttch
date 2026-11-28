import { hasCmdOrCtrl } from '@/hooks/useZoomControls';

/**
 * Is this keydown the "download front log" shortcut: Cmd+Option+Shift+G on macOS, Ctrl+Alt+Shift+G elsewhere?
 *
 * G, because the obvious letters do not work in a JetBrains IDE: Cmd/Ctrl+Option/Alt+Shift+L opens the IDE's reformat
 * dialog, and with D the key never reached the chat on macOS (seen in IntelliJ IDEA 2024.2; the modifiers arrived, the
 * letter did not). Matched on the physical key, because Option+Shift+G types a character on macOS, and ignored while
 * held so the OS repeat does not ask for the file again and again.
 */
export function isDownloadLogShortcut(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && e.altKey && e.shiftKey && !e.repeat && e.code === 'KeyG';
}
