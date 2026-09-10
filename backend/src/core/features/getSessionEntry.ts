import { join } from 'path';
import { extractSessionInfo } from './extractSessionInfo';
import { getProjectSessionsPath } from './getProjectSessionsPath';
import { readSessionTitleOverrides } from './sessionTitleOverrides';
import type { SessionListEntry } from './getSessionsList';

/**
 * Build the list row for ONE session, by id.
 *
 * The session list is served one page at a time, so a session ranked past that
 * page is present in the project yet absent from the rows the webview holds.
 * Everything the webview reads off a row — the header title, the directory a
 * switch navigates to — then falls back or fails for a session that opens
 * perfectly well. This lets the session being opened carry its own row along,
 * so the list contains it regardless of where it ranks. See #434.
 *
 * Assembled exactly as `resolvePage` assembles a row (same info, same title
 * override), because a row that differs from its list counterpart would make
 * the header change as soon as paging happens to reach it.
 *
 * Returns null when the session is not a row the list shows: a sidechain, a
 * transcript that never held a conversation, or one that could not be read.
 */
export async function getSessionEntry(
  workingDir: string,
  sessionId: string,
): Promise<SessionListEntry | null> {
  try {
    const sessionsPath = await getProjectSessionsPath(workingDir);
    const info = await extractSessionInfo(join(sessionsPath, `${sessionId}.jsonl`));
    if (info.isSidechain) return null;

    const overrides = await readSessionTitleOverrides(sessionsPath);
    const override = overrides[sessionId];

    return {
      sessionId,
      sessionDir: workingDir,
      ...info,
      ...(override ? { title: override } : {}),
    };
  } catch (err) {
    console.error('[node-backend]', 'Failed to build session entry:', sessionId, err);
    return null;
  }
}
