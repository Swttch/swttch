import type { ConnectionManager } from '../../ws/connection-manager';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { parseResolveDiffParams, resolveDiffReview } from '../features/resolveDiff';

/**
 * Answer a pending file-edit permission request from the webview's own review
 * diff, the way the IDE's diff answers it through the JetBrains bridge.
 *
 * Deliberately the same message and the same resolver: a review is a review
 * wherever it is drawn, and giving the webview its own decision path would let
 * the two disagree about what "kept nothing" or "edited back to the original"
 * means. Only the transport differs -- this arrives as an ordinary webview
 * request rather than a JSON-RPC notification from Kotlin.
 */
export async function resolveDiffHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
): Promise<void> {
  const parsed = parseResolveDiffParams((message.payload ?? {}) as Record<string, unknown>);
  if (!parsed) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'malformed RESOLVE_DIFF payload',
    });
    return;
  }

  resolveDiffReview(connections, parsed);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
  });
}
