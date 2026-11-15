import type { SessionMark } from './sessionMarks';

/**
 * The mark of each session as the screens last heard it, for finding out which sessions a change
 * of the marks table is about.
 *
 * The table is one file the package writes, and a change to it says nothing about which session it
 * was. Comparing the table now with what the screens were last told gives the sessions to tell them
 * about, one by one, instead of asking every screen to read its whole list again.
 *
 * What is told by another way (a tool that archives a session, the archive button) is noted here
 * too, so the change the table then shows is not told a second time.
 */
const known = new Map<string, string>();
let seeded = false;

const keyOf = (mark: SessionMark): string => JSON.stringify(mark.row);

/** Take the marks as they are as the ones the screens know. */
export function seedKnownMarks(marks: Map<string, SessionMark>): void {
  known.clear();
  for (const [sessionId, mark] of marks) known.set(sessionId, keyOf(mark));
  seeded = true;
}

/** Note that the screens were told this mark for the session (none, when it has none). */
export function noteSentMark(sessionId: string, mark: SessionMark | undefined): void {
  if (mark) known.set(sessionId, keyOf(mark));
  else known.delete(sessionId);
}

/**
 * The sessions whose mark differs from what the screens know, as they are now, and the marks
 * become the ones known. A session with no mark now comes back with `null`.
 *
 * Null when nothing was known yet: there is nothing to compare, so the marks are taken as the ones
 * known and the caller has to find another way to tell the screens.
 */
export function takeMarkChanges(
  current: Map<string, SessionMark>,
): Array<{ sessionId: string; mark: SessionMark | null }> | null {
  if (!seeded) {
    seedKnownMarks(current);
    return null;
  }
  const changes: Array<{ sessionId: string; mark: SessionMark | null }> = [];
  for (const [sessionId, mark] of current) {
    const key = keyOf(mark);
    if (known.get(sessionId) !== key) {
      changes.push({ sessionId, mark });
      known.set(sessionId, key);
    }
  }
  for (const sessionId of [...known.keys()]) {
    if (!current.has(sessionId)) {
      changes.push({ sessionId, mark: null });
      known.delete(sessionId);
    }
  }
  return changes;
}

/** Forget every mark. For tests. */
export function resetKnownMarks(): void {
  known.clear();
  seeded = false;
}
