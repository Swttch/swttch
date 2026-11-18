import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { join } from 'node:path';
import { getProjectSessionsPath } from '../features/getProjectSessionsPath';
import { readSessionTail } from '../features/readSessionTail';

/** How many of the newest entries a reply carries when the request names no number. */
export const SESSION_TAIL_DEFAULT_LIMIT = 40;
/** The most a reply carries, whatever the request asks for. */
export const SESSION_TAIL_MAX_LIMIT = 200;

/** A session's id as the CLI names its record: nothing that could lead the path out of the sessions folder. */
const SESSION_ID = /^[A-Za-z0-9_-]+$/;

/**
 * GET_SESSION_TAIL — the newest messages of a session, as its record holds them.
 *
 * It is a read and nothing else. LOAD_SESSION opens a session: it subscribes the connection to it and marks it as
 * spawned, so the next message resumes it. The card of a session another session started only wants to know what that
 * session is doing, and must not take it over by asking.
 *
 * It reads the end of the record's file (see `readSessionTail`) and does not go through the session index, which is
 * kept for the sessions a person has open: the card asks every couple of seconds, for each session that works.
 *
 * The entries are the record's own, none renamed and none edited (the original-data rule); only how many of the
 * newest ones are sent is cut, and the record's own bookkeeping lines are not among them.
 */
export async function getSessionTailHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const payload = message.payload as { workingDir?: string; sessionId?: string; limit?: number } | undefined;

    if (!payload?.workingDir || !payload?.sessionId) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: 'workingDir and sessionId are required',
      });
      return;
    }

    const asked = typeof payload.limit === 'number' && payload.limit > 0 ? Math.floor(payload.limit) : SESSION_TAIL_DEFAULT_LIMIT;
    const limit = Math.min(asked, SESSION_TAIL_MAX_LIMIT);
    if (!SESSION_ID.test(payload.sessionId)) {
      connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'error', error: 'sessionId is not a session id' });
      return;
    }
    const file = join(await getProjectSessionsPath(payload.workingDir), `${payload.sessionId}.jsonl`);
    let messages: Awaited<ReturnType<typeof readSessionTail>>;
    try {
      messages = await readSessionTail(file, limit);
    } catch (err) {
      // A session with no record has nothing it is doing: an empty answer, as a session without entries gives.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
      messages = [];
    }

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      messages,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
