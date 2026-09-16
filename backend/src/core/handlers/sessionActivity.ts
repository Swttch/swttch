import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType, SessionActivity } from '../../shared';

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

/**
 * REPORT_SESSION_ACTIVITY — a chat screen saying what it is doing.
 *
 * This is the only thing that moves a session between idle, running and
 * awaiting. The backend used to decide for itself, and it decided from the
 * moment it wrote a message to the CLI's stdin — which is blind to every turn
 * the CLI starts without being asked. A background task finishing is one: the
 * transcript animated, the favicon turned, and the row in the session list sat
 * still, because only one of the three was reading the CLI (issue #456).
 *
 * `done` is not reported and is not accepted. Whether a finished turn is still
 * unread is not something a chat screen knows about itself, so it is derived
 * here, from the move out of a busy state, and cleared by MARK_SESSION_READ.
 */
export function reportSessionActivityHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const payload = message.payload as
    | { sessionId?: string; activity?: string }
    | undefined;
  const sessionId = payload?.sessionId;
  const reported = payload?.activity;

  if (sessionId && isReportable(reported)) {
    connections.reportSessionActivity(sessionId, reported);
  }

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
  });
}

/**
 * Whether a reported word is one a screen is allowed to say.
 *
 * `done` is excluded on purpose rather than by omission: it is a real member of
 * the enum, and letting a screen assert it would let one tab mark another tab's
 * session unread.
 */
function isReportable(
  activity: string | undefined,
): activity is SessionActivity.Idle | SessionActivity.Running | SessionActivity.Awaiting {
  return (
    activity === SessionActivity.Idle ||
    activity === SessionActivity.Running ||
    activity === SessionActivity.Awaiting
  );
}
