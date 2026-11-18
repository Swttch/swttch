import { hasCmdOrCtrl } from '@/hooks/useZoomControls';
import type { CommandPaletteServices } from './types';

/**
 * Is this keydown the archive shortcut: Cmd+Option+A on macOS, Ctrl+Alt+A elsewhere, nothing else held?
 *
 * The same keys the Claude desktop app archives a session with. There they only archive; here the same keys also bring
 * an archived session back (see `toggleArchiveOfOpenSession`).
 *
 * Matched on the physical key, because Option+A types a character on macOS ("å") and `key` is that character.
 * Ignored while held, so the OS repeat does not archive and bring back the session in turn.
 */
export function isArchiveShortcut(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && e.altKey && !e.shiftKey && !e.repeat && e.code === 'KeyA';
}

/**
 * Where the shortcut works: the same place as the Archive conversation row of the Context menu (the session-management
 * MCP is installed and the open session is saved), except that an archived session counts too, because the shortcut
 * is what brings it back.
 *
 * Asked while matching the key, so that where it does not work the key is left alone (with Option held, macOS types a character).
 */
export function canToggleArchive(services: CommandPaletteServices): boolean {
  return services.archive.available && services.session.currentSessionId != null;
}

/** Archive the open session, or bring it back when it is archived. Resolves true once the MCP accepted it. */
export async function toggleArchiveOfOpenSession(services: CommandPaletteServices): Promise<boolean> {
  const sessionId = services.session.currentSessionId;
  if (!sessionId || !services.archive.available) return false;
  return services.archive.setArchived(sessionId, !services.archive.isCurrentArchived);
}
