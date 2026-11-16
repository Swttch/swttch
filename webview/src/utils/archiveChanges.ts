import { isArchivedMark } from '@/components/SessionList/archive';
import type { SessionMetaDto } from '@/dto';

/**
 * What the list said about each session the last time it was looked at: true when the session was archived.
 */
export type ArchivedSnapshot = Map<string, boolean>;

/**
 * The sessions that were archived, and the ones that were brought back, since the snapshot was taken, and the
 * snapshot of the rows as they are now.
 *
 * A row that is not in the list for a moment (the list is emptied and filled again when it is read anew) keeps what
 * the snapshot knew of it, so the change is still noticed when the row comes back on the other side.
 *
 * A session counts only when the snapshot already held its row on the other side. A row the snapshot did not hold
 * (the list loading for the first time, the next page, another folder's sessions, a session that was just created)
 * is not "archived just now" even when it arrives archived. That keeps the list's own loading from raising a message,
 * and leaves one rule for every way a session changes sides: whatever changed the row, the change is what is noticed.
 */
export function findArchiveChanges(
  previous: ArchivedSnapshot,
  sessions: readonly SessionMetaDto[],
): { archived: SessionMetaDto[]; unarchived: SessionMetaDto[]; snapshot: ArchivedSnapshot } {
  const snapshot: ArchivedSnapshot = new Map(previous);
  const archived: SessionMetaDto[] = [];
  const unarchived: SessionMetaDto[] = [];
  for (const session of sessions) {
    const isArchived = isArchivedMark(session.sessionMark);
    snapshot.set(session.id, isArchived);
    const was = previous.get(session.id);
    if (isArchived && was === false) archived.push(session);
    if (!isArchived && was === true) unarchived.push(session);
  }
  return { archived, unarchived, snapshot };
}
