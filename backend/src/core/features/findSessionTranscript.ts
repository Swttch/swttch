import { join } from 'path';
import { readdir, stat } from 'fs/promises';
import { getClaudeConfigDir } from './claudeConfigDir';
import { getProjectSessionsPath } from './getProjectSessionsPath';

/** A session id is a file name: nothing that could name another place may pass. */
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

/** Where a session was found outside the folder it was asked for, so that the next question does not search again. */
const foundElsewhere = new Map<string, string>();

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The transcript file of a session: in the project folder it is said to live in, or else wherever it is.
 *
 * A session another session started (the session-management MCP's `start_session`) lives in the folder it was started
 * for, which is not the folder of the screen that points at it. That screen only knows its own folder, so asking
 * "is the transcript there?" called a session that works at that moment deleted. Looked for in the folder given first
 * (the common case: one stat), then in every project folder.
 *
 * Undefined when no project folder holds it.
 */
export async function findSessionTranscript(sessionId: string, workingDir?: string): Promise<string | undefined> {
  if (!SAFE_ID.test(sessionId)) return undefined;
  if (workingDir) {
    try {
      const file = join(await getProjectSessionsPath(workingDir), `${sessionId}.jsonl`);
      if (await exists(file)) return file;
    } catch {
      // No folder to look in for that directory: the search below still can find it.
    }
  }
  const known = foundElsewhere.get(sessionId);
  if (known && (await exists(known))) return known;
  foundElsewhere.delete(sessionId);

  const root = join(getClaudeConfigDir(), 'projects');
  let folders: string[];
  try {
    folders = await readdir(root);
  } catch {
    return undefined;
  }
  const hits = await Promise.all(
    folders.map(async (folder) => {
      const file = join(root, folder, `${sessionId}.jsonl`);
      return (await exists(file)) ? file : undefined;
    }),
  );
  const file = hits.find((hit): hit is string => hit !== undefined);
  if (file) foundElsewhere.set(sessionId, file);
  return file;
}

/** Forget what was found elsewhere. For tests. */
export function resetFoundSessionTranscripts(): void {
  foundElsewhere.clear();
}
