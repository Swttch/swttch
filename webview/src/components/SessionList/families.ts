import { SessionMetaDto } from '@/dto';

/**
 * Which of the sessions on hand are drawn under which.
 *
 * A session another session started (through the session-management MCP, which
 * records who started whom) is drawn under that session. A session it started
 * in turn is drawn under IT, one step further in, and so on: the list shows the
 * tree as it is. The Claude desktop app flattens the whole family to one level
 * under the top session, which hides who started whom; that is the part of its
 * session list people ask about most, so it is not copied here.
 *
 * A session is drawn under its starter only while the starter is on hand too:
 * the starter may sit on a page not fetched yet, belong to another folder, or
 * be filtered out by a search, and then the session is an ordinary row (and the
 * sessions it started still hang under it).
 */
export class SessionFamilies {
  private constructor(
    /** A session drawn under another, to the id of the session that started it. */
    private readonly parentByChild: ReadonlyMap<string, string>,
    /** A session that started others, to those sessions in the order they were started. */
    private readonly childrenByParent: ReadonlyMap<string, SessionMetaDto[]>,
  ) {}

  /** No session is drawn under another. */
  static readonly none = new SessionFamilies(new Map(), new Map());

  static of(sessions: SessionMetaDto[]): SessionFamilies {
    const byId = new Map(sessions.map((session) => [session.id, session]));
    const parentByChild = new Map<string, string>();
    const childrenByParent = new Map<string, SessionMetaDto[]>();

    for (const session of sessions) {
      const starter = starterOf(session, byId);
      if (starter === null) continue;
      parentByChild.set(session.id, starter.id);
      const children = childrenByParent.get(starter.id);
      if (children) children.push(session);
      else childrenByParent.set(starter.id, [session]);
    }

    for (const children of childrenByParent.values()) {
      children.sort((a, b) => startedAtOf(a) - startedAtOf(b));
    }

    return new SessionFamilies(parentByChild, childrenByParent);
  }

  /** The id of the session that started [sessionId], or null when it is a row of its own. */
  parentOf(sessionId: string): string | null {
    return this.parentByChild.get(sessionId) ?? null;
  }

  /** The sessions [sessionId] started itself, oldest start first. Empty when it started none. */
  childrenOf(sessionId: string): SessionMetaDto[] {
    return this.childrenByParent.get(sessionId) ?? [];
  }

  /**
   * Every session under [sessionId], in the order the list draws them: each
   * session followed at once by the sessions it started. A session in [folded]
   * is listed itself, without what it started.
   */
  descendantsOf(sessionId: string, folded?: ReadonlySet<string>): SessionMetaDto[] {
    const rows: SessionMetaDto[] = [];
    const walk = (id: string) => {
      if (folded?.has(id)) return;
      for (const child of this.childrenOf(id)) {
        rows.push(child);
        walk(child.id);
      }
    };
    walk(sessionId);
    return rows;
  }

  /** Not one session on hand is drawn under another. */
  get isEmpty(): boolean {
    return this.parentByChild.size === 0;
  }
}

/**
 * The session that started [session], when it is on hand.
 *
 * Null as well when the records loop back to the session itself: two sessions
 * each claiming the other started it would otherwise each be drawn under the
 * other, and neither would have a row. Each of them is then a row of its own.
 */
function starterOf(session: SessionMetaDto, byId: Map<string, SessionMetaDto>): SessionMetaDto | null {
  const starterId = session.sessionMark?.parentSessionUid;
  const starter = starterId ? byId.get(starterId) : undefined;
  if (!starter || starter.id === session.id) return null;

  const visited = new Set([session.id, starter.id]);
  let current = starter;
  for (;;) {
    const nextId = current.sessionMark?.parentSessionUid;
    const next = nextId ? byId.get(nextId) : undefined;
    if (!next) break;
    if (next.id === session.id) return null;
    // A loop further up that does not pass through this session: stop walking,
    // the session still hangs under its own starter.
    if (visited.has(next.id)) break;
    visited.add(next.id);
    current = next;
  }
  return starter;
}

/** When the session was started: what the package recorded, else when its transcript began. */
function startedAtOf(session: SessionMetaDto): number {
  return session.sessionMark?.startedAt || session.createdAt?.getTime() || 0;
}

/**
 * What a session list needs to draw sessions under the ones that started them:
 * who sits under whom, which of them are folded away, and how to fold one.
 *
 * Made by `useSessionList` and handed to `SessionList` whole, so the two
 * surfaces that show sessions (the header dropdown and the session panel) pass
 * one thing along and cannot hand over half of it.
 */
export class SessionNesting {
  constructor(
    readonly families: SessionFamilies,
    /** Ids of the sessions whose started sessions are folded away. */
    readonly collapsed: ReadonlySet<string>,
    /** Fold the sessions [sessionId] started away, or bring them back. */
    readonly toggle: (sessionId: string) => void,
  ) {}

  /** Nothing is nested and nothing can be folded. */
  static readonly none = new SessionNesting(SessionFamilies.none, new Set(), () => {});
}

/**
 * Where one row sits in the tree as it is drawn: under which row, how deep, and
 * which of the tree lines pass through it.
 */
export class FamilyRowPlacement {
  constructor(
    /** The row this one is drawn under. */
    readonly parentId: string,
    /** How many rows it sits under; 1 for a session started by a top session. */
    readonly depth: number,
    /** No later row is drawn under the same row: its own line ends here, turning toward the title. */
    readonly isLast: boolean,
    /**
     * For each level above its own (index 0 is level 1), whether that level has
     * a later row, so its line runs on through this row.
     */
    readonly passing: boolean[],
  ) {}
}

/**
 * Place the rows of one group of the list, given in the order they are drawn.
 *
 * Only the rows in [drawn] count. A filter can hide a session and keep the ones
 * it started; those are then drawn under the nearest session above them that is
 * still a row, or as rows of their own when there is none. A row of its own has
 * no placement.
 */
export function placeFamilyRows(
  rows: SessionMetaDto[],
  families: SessionFamilies,
  drawn: ReadonlySet<string>,
): Map<string, FamilyRowPlacement> {
  const drawnParentOf = (sessionId: string): string | null => {
    let parent = families.parentOf(sessionId);
    while (parent !== null && !drawn.has(parent)) parent = families.parentOf(parent);
    return parent;
  };
  const depths = rows.map((row) => {
    let depth = 0;
    for (let parent = drawnParentOf(row.id); parent !== null; parent = drawnParentOf(parent)) depth++;
    return depth;
  });

  // Whether [level] has another row after row [index], before the tree climbs
  // back above that level.
  const continues = (index: number, level: number): boolean => {
    for (let next = index + 1; next < rows.length; next++) {
      if (depths[next] < level) return false;
      if (depths[next] === level) return true;
    }
    return false;
  };

  const placements = new Map<string, FamilyRowPlacement>();
  rows.forEach((row, index) => {
    const depth = depths[index];
    const parentId = drawnParentOf(row.id);
    if (depth === 0 || parentId === null) return;
    const passing: boolean[] = [];
    for (let level = 1; level < depth; level++) passing.push(continues(index, level));
    placements.set(row.id, new FamilyRowPlacement(parentId, depth, !continues(index, depth), passing));
  });
  return placements;
}
