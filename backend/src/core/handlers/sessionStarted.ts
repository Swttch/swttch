import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { awaitSessionTranscript } from '../features/awaitSessionTranscript';
import { announceSessionCreated } from '../features/announceSessionCreated';
import { announceSessionsUpdated } from '../features/sessionsUpdated';

/**
 * SESSION_STARTED: a tab created a session and is telling everyone else.
 *
 * Two things follow from one message, because both answer the same question at
 * different moments: what the other lists should show NOW, and what the real row is.
 *
 *  1. The row the creating tab drew is handed to every other screen whose list can hold the
 *     session, as a `create`, so a session list in another window, another tab, or the IDE's
 *     side panel shows it at the same moment the creating tab's dropdown does.
 *  2. A wait starts for that session's transcript. When the file exists, the row it gives is
 *     handed to every screen, the creating tab included, as another `create`, which replaces the
 *     drawn row with the recorded one. No screen reads its list for it.
 *
 * The drawn row is taken as the webview sent it and passed through untouched. This
 * backend does not build session rows: the only places that do read transcripts.
 */
export function sessionStartedHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const payload = message.payload as
    | { sessionId?: string; workingDir?: string; session?: unknown }
    | undefined;
  const sessionId = payload?.sessionId;
  const workingDir = payload?.workingDir;

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
  if (!sessionId) return;

  // Everyone EXCEPT the tab that sent it: that tab already has the row, and
  // handing it back would ask it to merge what it just drew.
  if (payload?.session) {
    announceSessionsUpdated(
      connections,
      { action: 'create', session: payload.session as Record<string, unknown> },
      { exceptConnectionId: connectionId, sessionDirs: workingDir ? [workingDir] : [] },
    );
  }

  if (!workingDir) return;
  void awaitSessionTranscript(sessionId, workingDir, () => {
    console.error('[node-backend]', `Transcript appeared for session ${sessionId}: handing over its row`);
    void announceSessionCreated(connections, sessionId, workingDir);
  });
}
