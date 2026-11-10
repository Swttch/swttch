import { join } from 'path';
import { entitiesRoot } from '../entities/entityPaths';
import { JsonlFile } from '../entities/storage/JsonlFile';
import { isSessionMcpInstalled } from '../session-mcp';

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
  return (await isSessionMcpInstalled()) ? readSessionMarks() : new Map();
}
