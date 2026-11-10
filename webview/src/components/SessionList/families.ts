import { SessionMetaDto } from '@/dto';

/**
 * Which of the sessions on hand are drawn under which.
 *
 * A session another session started (through the session-management MCP, which
 * records who started whom) is drawn under that session, the way the Claude
 * desktop app nests the sessions a session started. A session is drawn under
 * another only while that other one is on hand too: its starter may sit on a
 * page not fetched yet, belong to another folder, or be filtered out by a
 * search, and then the session is an ordinary row.
 *
 * The nesting is one level deep. A session started by a started session is
 * drawn under the same top session as its starter, next to it, so the list
 * never indents twice.
 */
export class SessionFamilies {
  private constructor(
    /** A session drawn under another, to the id of the session it is drawn under. */
    private readonly topByMember: ReadonlyMap<string, string>,
    /** A session others are drawn under, to those sessions in the order they were started. */
    private readonly membersByTop: ReadonlyMap<string, SessionMetaDto[]>,
  ) {}

  /** No session is drawn under another. */
  static readonly none = new SessionFamilies(new Map(), new Map());

  static of(sessions: SessionMetaDto[]): SessionFamilies {
    const byId = new Map(sessions.map((session) => [session.id, session]));
    const topByMember = new Map<string, string>();
    const membersByTop = new Map<string, SessionMetaDto[]>();

    for (const session of sessions) {
      const top = topOf(session, byId);
      if (top === null) continue;
      topByMember.set(session.id, top.id);
      const members = membersByTop.get(top.id);
      if (members) members.push(session);
      else membersByTop.set(top.id, [session]);
    }

    for (const members of membersByTop.values()) {
      members.sort((a, b) => startedAtOf(a) - startedAtOf(b));
    }

    return new SessionFamilies(topByMember, membersByTop);
  }

  /** The id of the session [sessionId] is drawn under, or null when it is a row of its own. */
  topOf(sessionId: string): string | null {
    return this.topByMember.get(sessionId) ?? null;
  }

  /** The sessions drawn under [sessionId], oldest start first. Empty for a session that started none. */
  membersOf(sessionId: string): SessionMetaDto[] {
    return this.membersByTop.get(sessionId) ?? [];
  }

  /** Not one session on hand is drawn under another. */
  get isEmpty(): boolean {
    return this.topByMember.size === 0;
  }
}

/**
 * Follow "who started this" upward for as long as the starter is on hand.
 *
 * Null when the session has no starter on hand. Null as well when the records
 * loop back on themselves: two sessions each claiming the other started it would
 * otherwise each be drawn under the other, and neither would have a row.
 */
function topOf(session: SessionMetaDto, byId: Map<string, SessionMetaDto>): SessionMetaDto | null {
  const visited = new Set([session.id]);
  let current = session;
  for (;;) {
    const starterId = current.sessionMark?.parentSessionUid;
    const starter = starterId ? byId.get(starterId) : undefined;
    if (!starter) break;
    if (visited.has(starter.id)) return null;
    visited.add(starter.id);
    current = starter;
  }
  return current === session ? null : current;
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
