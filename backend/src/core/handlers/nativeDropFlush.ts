import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { resolveDroppedPaths } from '../features/macDragPasteboard';

/**
 * Webview-side trigger that releases the paths CefDragHandler stashed on drag-enter.
 *
 * Flow: Kotlin CefDragHandler.onDragEnter → /rpc NATIVE_DROP notification → backend
 * stashes paths against the panelId. When the user actually releases the mouse, the
 * webview's HTML5 `drop` handler fires this RPC. The backend looks up the stash for
 * this connection's panel and pushes the paths back as NATIVE_DROP_ENTRIES, which
 * ChatInput's subscribe handler turns into attachment chips.
 *
 * Where the IDE could only name a dropped file, its full path is looked up here, after the
 * release (see [resolveDroppedPaths]). The entries go out before the ACK either way: the
 * page reads the ACK as "the paths have arrived or are not coming".
 *
 * No-op (but still ACKs) when there's no stash — e.g. drops that originated inside
 * the page (image paste), or stale flushes after the stash was already consumed.
 */
export async function nativeDropFlushHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const stashed = connections.takeNativeDropStash(connectionId);
  if (stashed && stashed.length > 0) {
    const entries = await resolveDroppedPaths(stashed);
    if (entries.length > 0) {
      connections.sendTo(connectionId, MessageType.NATIVE_DROP_ENTRIES, { entries });
    }
  }
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
