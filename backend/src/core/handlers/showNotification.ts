import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';

/**
 * Handle SHOW_NOTIFICATION: ask the host (IDE) to raise a native desktop
 * notification for an "attention needed" / "response complete" event.
 *
 * The webview only sends this when it cannot raise its own browser notification
 * (JCEF has no Notification API). [workingDir] lets the bridge route the request
 * to the IDE serving that project root; the host decides whether to suppress it
 * (e.g. when its window is already focused).
 */
export async function showNotificationHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const title = message.payload?.['title'];
  if (typeof title !== 'string' || title.length === 0) {
    connections.sendTo(connectionId, 'ACK', {
      requestId: message.requestId,
      status: 'error',
      error: 'Missing or invalid title',
    });
    return;
  }

  const bodyValue = message.payload?.['body'];
  const body = typeof bodyValue === 'string' ? bodyValue : '';
  const workingDirValue = message.payload?.['workingDir'];
  const workingDir = typeof workingDirValue === 'string' && workingDirValue.length > 0
    ? workingDirValue
    : undefined;
  const panelIdValue = message.payload?.['panelId'];
  const panelId = typeof panelIdValue === 'string' && panelIdValue.length > 0
    ? panelIdValue
    : undefined;

  try {
    await bridge.showNotification({ title, body, workingDir, panelId });
    connections.sendTo(connectionId, 'ACK', {
      requestId: message.requestId,
      status: 'ok',
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'showNotification failed:', err);
    connections.sendTo(connectionId, 'ACK', {
      requestId: message.requestId,
      status: 'error',
      error,
    });
  }
}
