import { plainToInstance } from 'class-transformer';
import { SessionMarkDto, SessionMetaDto } from '../dto';
import { toFullTitle, toTitle } from '../mappers/sessionTransformer';

/**
 * Keeping the rows of a session list right from the news the backend sends.
 *
 * Every screen shows its own copy of the list. Reading the whole list again to learn that one
 * session changed is slow when several screens are open, so the backend also says what changed
 * (an `update` of one session), and the screen puts that onto the row at once.
 *
 * The rule that keeps a row from showing something a fresh read would not: every piece of
 * news carries `ts`, its place among the others, and a list read at time T is the state of
 * the sessions as of T. The updates up to T are already in it; the ones after T are not, and
 * go onto it in the order of their `ts`.
 */

/**
 * One piece of news about one session, and where it stands among the other news (`ts`).
 *
 * - `update`: some items of the session changed (`fields`, under the names the list row uses: `title`, `sessionMark`).
 * - `create`: the session came to exist (`row` is its row, as the list gives it).
 * - `delete`: the session is gone.
 */
export type SessionNews =
  | { kind: 'update'; ts: number; sessionId: string; fields: Record<string, unknown> }
  | { kind: 'create'; ts: number; sessionId: string; row: unknown }
  | { kind: 'delete'; ts: number; sessionId: string };

/**
 * The row with the changed items put on. A new row, of the same class: rows are held by state, so
 * a row that is changed in place would not show.
 */
export function applyUpdate(row: SessionMetaDto, fields: Record<string, unknown>): SessionMetaDto {
  const changed: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (name === 'sessionId') continue;
    if (name === 'title' && typeof value === 'string') {
      // The list gives a row its title in two forms, cut to fit a row and whole; a title that came by
      // news must read the same as the one a read of the list would give.
      changed.title = toTitle(value);
      changed.fullTitle = toFullTitle(value);
      continue;
    }
    if (name === 'lastTimestamp' && typeof value === 'string') {
      // A row is placed in the list by the time of its last activity, which is what the list reads it as.
      changed.updatedAt = new Date(value);
      continue;
    }
    // The mark arrives as the plain row of the package's table; the list converts it the same way.
    changed[name] =
      name === 'sessionMark' && value !== null && typeof value === 'object'
        ? plainToInstance(SessionMarkDto, value)
        : value;
  }
  return Object.assign(Object.create(Object.getPrototypeOf(row)), row, changed);
}

/** How long, and how many, pieces of news are kept. A list read takes seconds, so a few minutes is more than enough. */
const KEEP_FOR_MS = 120_000;
const KEEP_AT_MOST = 1_000;

/**
 * The news about sessions that reached this screen lately, in the order of its `ts`.
 *
 * It is kept because a list this screen asked for may have been read before some of it and arrive
 * after, and what is not in that list (a change, a session that came to exist, one that is gone) has
 * to be put onto it again.
 */
export class SessionNewsJournal {
  private news: SessionNews[] = [];

  constructor(
    private readonly keepForMs: number = KEEP_FOR_MS,
    private readonly keepAtMost: number = KEEP_AT_MOST,
  ) {}

  record(item: SessionNews): void {
    // After the last one with the same or an earlier ts, so equal ones stay in the order they came.
    let at = this.news.length;
    while (at > 0 && this.news[at - 1].ts > item.ts) at--;
    this.news.splice(at, 0, item);

    const newest = this.news[this.news.length - 1].ts;
    const keepFrom = newest - this.keepForMs;
    let drop = 0;
    while (drop < this.news.length && this.news[drop].ts < keepFrom) drop++;
    drop = Math.max(drop, this.news.length - this.keepAtMost);
    if (drop > 0) this.news.splice(0, drop);
  }

  /** The news after [ts], oldest first. */
  after(ts: number): SessionNews[] {
    return this.news.filter((item) => item.ts > ts);
  }
}

/**
 * The rows of a list read at [readAt], with the news after that put onto them in the order of their
 * `ts`: a change is put on the row, a session created is added, a session deleted is taken out. The
 * news up to [readAt] is not put on again: the read already holds it, and a row must not turn back
 * to something older.
 *
 * Rows come back as they are when there is nothing to put on, so a state holding them does not change.
 * A session added comes last; the caller puts the rows in order.
 */
export function putNewsOnto(
  rows: SessionMetaDto[],
  readAt: number,
  journal: SessionNewsJournal,
): SessionMetaDto[] {
  const later = journal.after(readAt);
  if (later.length === 0) return rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  let touched = false;
  for (const item of later) {
    if (item.kind === 'create') {
      if (item.row && typeof item.row === 'object') {
        byId.set(item.sessionId, plainToInstance(SessionMetaDto, item.row));
        touched = true;
      }
    } else if (item.kind === 'delete') {
      touched = byId.delete(item.sessionId) || touched;
    } else {
      const row = byId.get(item.sessionId);
      if (!row) continue;
      byId.set(item.sessionId, applyUpdate(row, item.fields));
      touched = true;
    }
  }
  return touched ? [...byId.values()] : rows;
}
