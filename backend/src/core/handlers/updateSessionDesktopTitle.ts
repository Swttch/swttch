import { existsSync } from 'fs';
import { basename, isAbsolute, relative, resolve } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { getProjectSessionsPath } from '../features/getProjectSessionsPath';
import { removeSessionTitleOverride } from '../features/sessionTitleOverrides';
import { normalizeSessionName, renameSessionThroughCli } from '../features/cli-rename';
import { readTranscriptTitleState } from '../features/sessionTitleForDesktop';
import { announceSessionsUpdated } from '../features/sessionsUpdated';

/**
 * UPDATE_SESSION_DESKTOP_TITLE — make Claude Desktop read, for a session about to be opened there by a deep link, the
 * title this app shows for it.
 *
 * Desktop names a session it takes in from a CLI transcript by the `custom-title` entry, and by the first prompt when
 * there is none; it does not read `ai-title`. So a session this app showed under a generated title would open in
 * Desktop under its first prompt. The title goes in the way the session dropdown's rename does (the CLI's own
 * `rename_session`, which adds no lines to the chat), and only when the transcript has no `custom-title` yet: a name
 * somebody already chose, here or in Desktop, is never replaced.
 */
export async function updateSessionDesktopTitleHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const sessionId = message.payload?.sessionId as string | undefined;
  const title = (message.payload?.title as string | undefined)?.trim();
  const workingDir = message.payload?.workingDir as string | undefined;
  const fail = (error: string) =>
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'error', error });

  if (!sessionId || !title || !workingDir) {
    fail('sessionId, title, and workingDir are required');
    return;
  }

  try {
    if (sessionId !== basename(sessionId) || sessionId.includes('..')) {
      fail('Invalid sessionId');
      return;
    }
    const sessionsDir = await getProjectSessionsPath(workingDir);
    const sessionFile = resolve(sessionsDir, `${sessionId}.jsonl`);
    const relativeSessionFile = relative(resolve(sessionsDir), sessionFile);
    if (relativeSessionFile.startsWith('..') || isAbsolute(relativeSessionFile) || !existsSync(sessionFile)) {
      fail('Session not found');
      return;
    }

    const state = await readTranscriptTitleState(sessionFile);
    if (state.hasCustomTitle) {
      connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok', written: false });
      return;
    }

    await renameSessionThroughCli(connections, sessionId, title, workingDir);
    // A name kept in this app's own file outranks the transcript; the one just written is the same name, so it goes.
    await removeSessionTitleOverride(sessionsDir, sessionId);
    announceSessionsUpdated(
      connections,
      { action: 'update', session: { sessionId, title: normalizeSessionName(title) } },
      { sessionDirs: [workingDir] },
    );
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok', written: true });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
