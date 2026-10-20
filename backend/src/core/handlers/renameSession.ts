import { existsSync } from 'fs';
import { basename, isAbsolute, relative, resolve } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getProjectSessionsPath } from '../features/getProjectSessionsPath';
import { removeSessionTitleOverride } from '../features/sessionTitleOverrides';
import { normalizeSessionName, renameSessionThroughCli } from '../features/cli-rename';
import { MessageType } from '../../shared';

export async function renameSessionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const sessionId = message.payload?.sessionId as string | undefined;
  const title = (message.payload?.title as string | undefined)?.trim();
  const workingDir = message.payload?.workingDir as string | undefined;

  if (!sessionId || !title || !workingDir) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'sessionId, title, and workingDir are required',
    });
    return;
  }

  try {
    if (sessionId !== basename(sessionId) || sessionId.includes('..')) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: 'Invalid sessionId',
      });
      return;
    }

    const sessionsDir = await getProjectSessionsPath(workingDir);
    const sessionFile = resolve(sessionsDir, `${sessionId}.jsonl`);
    const relativeSessionFile = relative(resolve(sessionsDir), sessionFile);
    if (relativeSessionFile.startsWith('..') || isAbsolute(relativeSessionFile) || !existsSync(sessionFile)) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: 'Session not found',
      });
      return;
    }

    // The CLI's own `/rename` records the name, so every client reads it from the
    // transcript. The webview has already drawn the new name by the time this runs;
    // an error here is what makes it put the old one back.
    await renameSessionThroughCli(connections, sessionId, title, workingDir);

    // A name typed here before this version was kept in a file only this app read,
    // and it outranks the transcript. The CLI's name is the newer one, so it goes.
    await removeSessionTitleOverride(sessionsDir, sessionId);

    const shownTitle = normalizeSessionName(title);
    connections.broadcastToAll(MessageType.SESSIONS_UPDATED, {
      action: 'rename',
      session: { sessionId, title: shownTitle },
    });

    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok' });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
