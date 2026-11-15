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

/** Some items of one session that changed, and where that stands among the other news. */
export interface SessionUpdate {
  ts: number;
  sessionId: string;
  /** The items that changed, under the names the list row uses (`title`, `sessionMark`). */
  fields: Record<string, unknown>;
}

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
    // The mark arrives as the plain row of the package's table; the list converts it the same way.
    changed[name] =
      name === 'sessionMark' && value !== null && typeof value === 'object'
        ? plainToInstance(SessionMarkDto, value)
        : value;
  }
  return Object.assign(Object.create(Object.getPrototypeOf(row)), row, changed);
}

/** How long, and how many, updates are kept. A list read takes seconds, so a few minutes is more than enough. */
const KEEP_FOR_MS = 120_000;
const KEEP_AT_MOST = 1_000;

/**
 * The updates that reached this screen lately, in the order of their `ts`.
 *
 * They are kept because a list this screen asked for may have been read before some of them
 * and arrive after, and what is not in that list has to be put onto it again.
 */
export class SessionUpdateJournal {
  private updates: SessionUpdate[] = [];

  constructor(
    private readonly keepForMs: number = KEEP_FOR_MS,
    private readonly keepAtMost: number = KEEP_AT_MOST,
  ) {}

  record(update: SessionUpdate): void {
    // After the last one with the same or an earlier ts, so equal ones stay in the order they came.
    let at = this.updates.length;
    while (at > 0 && this.updates[at - 1].ts > update.ts) at--;
    this.updates.splice(at, 0, update);

    const newest = this.updates[this.updates.length - 1].ts;
    const keepFrom = newest - this.keepForMs;
    let drop = 0;
    while (drop < this.updates.length && this.updates[drop].ts < keepFrom) drop++;
    drop = Math.max(drop, this.updates.length - this.keepAtMost);
    if (drop > 0) this.updates.splice(0, drop);
  }

  /** The updates after [ts], oldest first. */
  after(ts: number): SessionUpdate[] {
    return this.updates.filter((update) => update.ts > ts);
  }
}

/**
 * The rows of a list read at [readAt], with the updates after that put onto them in the order of
 * their `ts`. The updates up to [readAt] are not put on again: the read already holds them, and a
 * row must not turn back to something older.
 *
 * Rows come back as they are when there is nothing to put on, so a state holding them does not change.
 */
export function putUpdatesOnto(
  rows: SessionMetaDto[],
  readAt: number,
  journal: SessionUpdateJournal,
): SessionMetaDto[] {
  const later = journal.after(readAt);
  if (later.length === 0) return rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  let touched = false;
  for (const update of later) {
    const row = byId.get(update.sessionId);
    if (!row) continue;
    byId.set(update.sessionId, applyUpdate(row, update.fields));
    touched = true;
  }
  return touched ? rows.map((row) => byId.get(row.id)!) : rows;
}
