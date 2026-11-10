import type { SessionSortKey } from './getSessionsList';
import type { SessionMark } from './sessionMarks';

/**
 * The sessions of a listing in the order they are paged: every top-level
 * session followed at once by everything under it.
 *
 * A top-level session is one no session on hand started. The sessions it
 * started follow it, each followed by the sessions IT started, oldest start
 * first, to any depth. That run is a family, and a page never cuts one.
 */
export class FamilyOrder {
  constructor(
    /** Every key of the listing, family after family. */
    readonly keys: SessionSortKey[],
    /** For each position, the position one past the last key of the family it is in. */
    private readonly familyEnds: number[],
  ) {}

  /** The position one past the last key of the family that holds [index]. */
  familyEnd(index: number): number {
    return this.familyEnds[index] ?? this.keys.length;
  }
}

/**
 * Arrange [sortedKeys] (newest first) into families.
 *
 * Why the page is cut by top-level session and not by row: a session and the
 * ones it started are drawn together, and a page cut in the middle of a family
 * left it half drawn. A manager that spoke a minute ago with a session it
 * started last week showed without that session until the user scrolled a
 * hundred rows down, at which point the row appeared far above what they were
 * looking at. With whole families, what is on screen is complete and nothing
 * above the fold changes while scrolling.
 *
 * A family is placed by its most recent session, wherever in the family that
 * session sits, so a session that is working now is not paged out under a
 * manager that last spoke long ago.
 *
 * Who started whom comes from [marks]. A session whose starter is not in the
 * listing (another folder, or a transcript that is gone) is a top-level session
 * here. With no marks at all, every session is its own family and the order is
 * the order given.
 */
export function orderByFamily(
  sortedKeys: SessionSortKey[],
  marks: ReadonlyMap<string, SessionMark>,
): FamilyOrder {
  const everyKeyAlone = () =>
    new FamilyOrder(
      sortedKeys,
      sortedKeys.map((_, index) => index + 1),
    );
  if (marks.size === 0) return everyKeyAlone();

  const byId = new Map(sortedKeys.map((key) => [key.sessionId, key]));
  const starterIdOf = (sessionId: string): string | null => {
    const starter = marks.get(sessionId)?.row.parentSessionUid;
    return typeof starter === 'string' && starter !== sessionId && byId.has(starter) ? starter : null;
  };
  // Two records that each name the other as its starter would leave both
  // without a place. A session whose line of starters comes back to itself is
  // treated as started by nobody.
  const parentIdOf = (sessionId: string): string | null => {
    const parent = starterIdOf(sessionId);
    if (parent === null) return null;
    const visited = new Set([sessionId, parent]);
    for (let next = starterIdOf(parent); next !== null; next = starterIdOf(next)) {
      if (next === sessionId) return null;
      if (visited.has(next)) break;
      visited.add(next);
    }
    return parent;
  };

  const childrenByParent = new Map<string, SessionSortKey[]>();
  const tops: SessionSortKey[] = [];
  for (const key of sortedKeys) {
    const parent = parentIdOf(key.sessionId);
    if (parent === null) {
      tops.push(key);
      continue;
    }
    const children = childrenByParent.get(parent);
    if (children) children.push(key);
    else childrenByParent.set(parent, [key]);
  }
  if (childrenByParent.size === 0) return everyKeyAlone();

  const startedAtOf = (key: SessionSortKey): number => {
    const startedAt = marks.get(key.sessionId)?.row.startedAt;
    return typeof startedAt === 'number' && startedAt > 0 ? startedAt : key.sortedAt;
  };
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => startedAtOf(a) - startedAtOf(b));
  }

  const families = tops.map((top, index) => {
    const members: SessionSortKey[] = [];
    const walk = (key: SessionSortKey) => {
      members.push(key);
      for (const child of childrenByParent.get(key.sessionId) ?? []) walk(child);
    };
    walk(top);
    return { members, index, latest: Math.max(...members.map((key) => key.sortedAt)) };
  });
  // Newest family first; the order given breaks a tie.
  families.sort((a, b) => b.latest - a.latest || a.index - b.index);

  const keys: SessionSortKey[] = [];
  const familyEnds: number[] = [];
  for (const { members } of families) {
    const end = keys.length + members.length;
    for (const member of members) {
      keys.push(member);
      familyEnds.push(end);
    }
  }
  return new FamilyOrder(keys, familyEnds);
}
