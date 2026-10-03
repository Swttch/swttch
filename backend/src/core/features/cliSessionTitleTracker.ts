/**
 * Tells a rename made in the CLI apart from the CLI merely repeating a name.
 *
 * The CLI announces the session's name (`session_title_changed`) on every start
 * of a process, `--resume` included, and again whenever `/rename` runs. The two
 * look the same on the wire, so reacting to every announcement would let a mere
 * reopen of the session discard a name the user typed in the GUI.
 *
 * What differs is the name itself: a repeat carries the name already known, a
 * rename carries a new one. The first announcement seen for a session has
 * nothing to compare against, so it only becomes the reference.
 */
const lastAnnouncedTitle = new Map<string, string>();

/** True when the announcement is a rename, false for a repeat or a first sighting. */
export function noteCliSessionTitle(sessionId: string, title: string): boolean {
  const known = lastAnnouncedTitle.get(sessionId);
  lastAnnouncedTitle.set(sessionId, title);
  return known !== undefined && known !== title;
}
