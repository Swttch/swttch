import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { awaitSessionTranscript } from '../features/awaitSessionTranscript';

/**
 * SESSION_STARTED — a tab created a session and is telling everyone else.
 *
 * Two things follow from one message, because both answer the same question at
 * different moments: what the other lists should show NOW, and when they can
 * stop showing a locally-built row and read the real one.
 *
 *  1. The row the creating tab drew is relayed to every other connection, so a
 *     session list in another window, another tab, or the IDE's side panel
 *     shows it at the same moment the creating tab's dropdown does.
 *  2. A wait starts for that session's transcript. When the file appears, the
 *     ordinary SESSIONS_UPDATED refresh goes out and each list re-reads from
 *     disk, replacing the relayed row with the recorded one.
 *
 * The row is taken as the webview sent it and passed through untouched. This
 * backend does not build session rows — the one place that does is the list
 * reader, and it reads transcripts. A row invented here would be a second
 * author for the same thing, free to disagree with both.
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
  connections.broadcastToAll(
    MessageType.SESSIONS_UPDATED,
    { action: 'started', session: payload?.session },
    connectionId,
  );

  if (!workingDir) return;
  void awaitSessionTranscript(sessionId, workingDir, () => {
    console.error('[node-backend]', `Transcript appeared for session ${sessionId} — refreshing lists`);
    connections.broadcastToAll(MessageType.SESSIONS_UPDATED, {
      action: 'upsert',
      session: { sessionId },
    });
  });
}
