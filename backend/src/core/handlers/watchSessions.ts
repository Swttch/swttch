import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { findSessionTranscript } from '../features/findSessionTranscript';
import { watchSessions } from '../features/sessionTranscriptFollower';
import { isSessionStarting } from '../features/sessionToolAnnouncer';

const SAFE_ID = /^[A-Za-z0-9._-]+$/;

function idsOf(message: IPCMessage): string[] {
  const ids = (message.payload as { sessionIds?: unknown } | undefined)?.sessionIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && SAFE_ID.test(id)) : [];
}

/**
 * WATCH_SESSIONS: the sessions the transcript on a screen points at (cards for sessions Claude started). What they
 * are doing (running, unread) is kept up to date for every screen, whoever runs them.
 */
export async function watchSessionsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  // Each session comes with the folder it lives in: the ones a transcript points at need not share one.
  const given = (message.payload as { sessions?: unknown } | undefined)?.sessions;
  const sessions = (Array.isArray(given) ? given : [])
    .map((item) => item as { sessionId?: unknown; workingDir?: unknown })
    .filter(
      (item): item is { sessionId: string; workingDir: string } =>
        typeof item.sessionId === 'string' && SAFE_ID.test(item.sessionId) && typeof item.workingDir === 'string' && item.workingDir !== '',
    );
  await watchSessions(connectionId, sessions, connections);
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok' });
}

/**
 * GET_SESSIONS_EXIST: which of some sessions have no transcript on disk any more (they were deleted). A card that
 * points at such a session says so.
 */
export async function getSessionsExistHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDir = (message.payload as { workingDir?: unknown } | undefined)?.workingDir;
  const missing: string[] = [];
  if (typeof workingDir === 'string' && workingDir !== '') {
    await Promise.all(
      idsOf(message).map(async (id) => {
        // A session another session started lives in the folder it was started for, not in the one of the screen
        // that asks: it is deleted only when no project folder holds its transcript.
        if ((await findSessionTranscript(id, workingDir)) !== undefined) return;
        // A session that is still being started has no transcript yet; that is not a deleted one.
        if (!isSessionStarting(id)) missing.push(id);
      }),
    );
  }
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok', missing });
}
