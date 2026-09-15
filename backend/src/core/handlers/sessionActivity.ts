import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';

/**
 * GET_SESSION_ACTIVITY — what every non-idle session is doing, and which
 * sessions a tab currently has open.
 *
 * The map is pushed on every change as SESSION_ACTIVITY_CHANGED, so this exists
 * for the one moment a push cannot cover: a webview that connects while a
 * session is already working has missed the announcement and would show that
 * row as idle until something else moved (issue #449).
 *
 * The answer spans every session this backend knows rather than the ones this
 * connection subscribes to, because the list that asks shows rows for sessions
 * nobody here is subscribed to.
 */
export function getSessionActivityHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): void {
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    ...connections.getSessionActivityPayload(),
  });
}

/**
 * MARK_SESSION_READ — the user has now looked at this session.
 *
 * Sent by each host under the condition it already uses to clear its own unread
 * badge, so the session list and the tab badge agree about what "read" means
 * rather than each deciding for itself.
 *
 * Only a finished turn is cleared; see `ConnectionManager.markSessionRead` for
 * why looking at a running session must not silence it.
 */
export function markSessionReadHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const sessionId = (message.payload as { sessionId?: string } | undefined)?.sessionId;
  if (sessionId) connections.markSessionRead(sessionId);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
  });
}
