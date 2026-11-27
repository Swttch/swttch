import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType, type ComposerDraft } from '../../shared';
import { loadComposerDraft, saveComposerDraft } from '../features/composerDrafts';

function answerError(connectionId: string, message: IPCMessage, connections: ConnectionManager, error: unknown): void {
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'error',
    error: error instanceof Error ? error.message : String(error),
  });
}

/** GET_COMPOSER_DRAFT — a session's composer draft, with the pictures the asker does not hold. */
export async function getComposerDraftHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const { sessionId, have } = (message.payload ?? {}) as { sessionId?: string; have?: string[] };
    if (!sessionId) throw new Error('sessionId is required');
    const stored = await loadComposerDraft(sessionId, have ?? []);
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok', ...stored });
  } catch (err) {
    answerError(connectionId, message, connections, err);
  }
}

/**
 * SAVE_COMPOSER_DRAFT — keep a session's composer draft, and tell the other windows, which show it when theirs is not
 * newer. The pictures are not sent on: a window asks for the ones it lacks.
 */
export async function saveComposerDraftHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const { workingDir, sessionId, draft, blobs } = (message.payload ?? {}) as {
      workingDir?: string;
      sessionId?: string;
      draft?: ComposerDraft;
      blobs?: Record<string, string>;
    };
    if (!workingDir || !sessionId || !draft) throw new Error('workingDir, sessionId and draft are required');
    const { editedAt } = await saveComposerDraft(workingDir, sessionId, draft, blobs ?? {});
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok', editedAt });
    connections.broadcastToAll(MessageType.COMPOSER_DRAFT_CHANGED, { sessionId, draft, editedAt }, connectionId);
  } catch (err) {
    answerError(connectionId, message, connections, err);
  }
}
