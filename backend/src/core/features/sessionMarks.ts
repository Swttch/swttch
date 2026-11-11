import { join } from 'path';
import { entitiesRoot } from '../entities/entityPaths';
import { JsonlFile } from '../entities/storage/JsonlFile';
import { isSessionMcpInstalled } from '../session-mcp';
import { currentDesktopState } from './desktopSync';

/**
 * One row of `sidebar/session_marks`: what the session-management MCP
 * (`@swttch/session-manager-mcp`) records about a session that the CLI has no
 * place for. Which session started it (`parentSessionUid`), the short name its
 * family calls it by (`handle`), when it was archived (`archivedAt`), and so on.
 *
 * The table belongs to that package, which is the only writer. This backend
 * reads it and hands every row on exactly as it was written, so the row is kept
 * whole instead of being copied field by field: a column the package adds later
 * reaches the webview without a change here.
 */
export class SessionMark {
  constructor(readonly row: Record<string, unknown>) {}

  /** The session the row is about. The table is keyed by the CLI's session id. */
  get sessionId(): string {
    return String(this.row.id);
  }

  toJSON(): Record<string, unknown> {
    return this.row;
  }
}

/**
 * Whether the session the row is about is archived, as the lists treat it.
 *
 * What the package recorded decides when it decided anything: a time (> 0) is
 * archived, and -1 says the session was brought back on purpose, which an archive
 * in the desktop app must not undo. Only when the package chose nothing (0, or no
 * row) is the desktop app's record used, which the row carries as
 * `desktopArchived` (see readSessionMarksToShow).
 */
export function isArchivedRow(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false;
  const chosen = row.archivedAt;
  if (typeof chosen === 'number' && chosen !== 0) return chosen > 0;
  return row.desktopArchived === true;
}

/**
 * The session that started the session the row is about, as the lists draw it.
 *
 * What the package recorded decides when it decided anything: a session id puts
 * the session under it, and '' says it was taken to the top level on purpose,
 * which the desktop app's record must not undo. Only when the package left it
 * open (null, or no row) is the desktop app's record used, which the row carries
 * as `desktopParentSessionId` (see readSessionMarksToShow).
 */
export function starterIdOfRow(row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  const chosen = row.parentSessionUid;
  if (typeof chosen === 'string') return chosen === '' ? null : chosen;
  const desktop = row.desktopParentSessionId;
  return typeof desktop === 'string' && desktop !== '' ? desktop : null;
}

function sessionMarksPath(): string {
  return join(entitiesRoot(), 'sidebar', 'session_marks.entity.jsonl');
}

/**
 * Every session mark, by session id.
 *
 * The file follows the rules of every entity table (one JSON object per line,
 * the later line for an id is the row, `{"id":..,"deleted":true}` removes it,
 * a line that is not JSON is skipped), except that an id here is the session id
 * (a string) and the table is not registered with this program's entity system.
 * That is why it is read here and not through a collection.
 *
 * A machine without the package has no such file, and that is an empty answer.
 * A file that cannot be read is an empty answer too: the marks only decorate the
 * session list, and a list without them is better than no list.
 */
export async function readSessionMarks(): Promise<Map<string, SessionMark>> {
  const marks = new Map<string, SessionMark>();
  let values: unknown[];
  try {
    values = (await new JsonlFile(sessionMarksPath()).read()).values;
  } catch (err) {
    console.error('[sessionMarks]', 'Could not read the session marks:', err);
    return marks;
  }

  for (const value of values) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id === '') continue;
    if (row.deleted === true) marks.delete(row.id);
    else marks.set(row.id, new SessionMark(row));
  }
  return marks;
}

/**
 * The marks the session list may show: every mark while the session-management
 * MCP is installed, and none while it is not.
 *
 * What the marks draw (a session under the one that started it, the arrow that
 * folds a family) is a feature of that package. The file can outlive the
 * package, or be written by another program that ships it, and a user who has
 * not installed the package here should not find its screens in their session
 * list. So the package being installed is the switch, the same switch that
 * decides whether its tools are handed to Claude.
 */
export async function readSessionMarksToShow(): Promise<Map<string, SessionMark>> {
  if (!(await isSessionMcpInstalled())) return new Map();
  const marks = await readSessionMarks();
  // The desktop app's record of who is under whom, and of what is archived, rides beside the row
  // (a row of its own for a session the package has none for), and no field of the package's row is
  // changed. It decides nothing where the package chose (see starterIdOfRow, isArchivedRow); it is
  // kept on every row it covers so that a screen can tell a value that differs from the desktop app's.
  const desktop = await currentDesktopState();
  const beside = new Map<string, Record<string, unknown>>();
  for (const [sessionId, starterId] of desktop.starters) beside.set(sessionId, { desktopParentSessionId: starterId });
  for (const sessionId of desktop.archived) beside.set(sessionId, { ...beside.get(sessionId), desktopArchived: true });
  for (const [sessionId, extra] of beside) {
    const row = marks.get(sessionId)?.row;
    marks.set(sessionId, new SessionMark({ ...(row ?? { id: sessionId }), ...extra }));
  }
  return marks;
}
