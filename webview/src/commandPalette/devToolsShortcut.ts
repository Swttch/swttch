import { isMac } from '@/config/environment';

/**
 * Is this keydown the open-developer-tools shortcut: Cmd+Option+I on macOS, nothing else held?
 *
 * Only on macOS. Cmd+Option+I is the key a Mac browser opens its own DevTools with, so inside the IDE it is the one a
 * person already reaches for. Elsewhere the same letter is taken: Ctrl+Alt+I cycles the transcript view, and the
 * settings button stays the way in.
 *
 * Matched on the physical key, because Option+I types a character on macOS and `key` is that character. Where the page
 * has no IDE to ask (a browser tab), the caller leaves the key alone so the browser's own DevTools open.
 */
export function isOpenDevToolsShortcut(e: KeyboardEvent): boolean {
  return isMac() && e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && !e.repeat && e.code === 'KeyI';
}
