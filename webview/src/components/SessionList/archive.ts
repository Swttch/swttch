/**
 * Whether the session a mark is about is archived, as the lists treat it.
 *
 * What the session-management MCP recorded decides when it decided anything: a time (> 0) is archived, and -1 says
 * the session was brought back on purpose, which an archive in the Claude desktop app must not undo. Only when it
 * chose nothing (0, or no mark) is the desktop app's record used, which the backend carries beside the mark as
 * `desktopArchived`. The same rule is applied by the backend (`isArchivedRow`).
 */
export function isArchivedMark(mark: { archivedAt?: number | null; desktopArchived?: boolean | null } | undefined | null): boolean {
  if (!mark) return false;
  const chosen = mark.archivedAt;
  if (typeof chosen === 'number' && chosen !== 0) return chosen > 0;
  return mark.desktopArchived === true;
}
