import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { loadPromptHistory } from '../features/loadPromptHistory';

/**
 * LOAD_PROMPT_HISTORY — one page of the prompts the user typed in a session, for
 * the composer's up/down-arrow history.
 */
export async function loadPromptHistoryHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const payload = message.payload as {
      workingDir?: string;
      sessionId?: string;
      beforeUuid?: string;
      limit?: number;
    } | undefined;

    if (!payload?.workingDir || !payload?.sessionId) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: 'workingDir and sessionId are required',
      });
      return;
    }

    const page = await loadPromptHistory(
      payload.workingDir,
      payload.sessionId,
      payload.beforeUuid,
      payload.limit,
    );

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      entries: page.entries,
      hasMore: page.hasMore,
      oldestUuid: page.oldestUuid,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
