import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';

/**
 * Open the IDE's embedded-browser DevTools for the chat webview.
 *
 * Takes no payload: it is a plain action, not a setting. The plugin binds no key
 * to it either — F12 used to, and the chat then swallowed the IDE's own F12
 * shortcuts (issue #333), so the settings screen is the only way in.
 */
export async function openDevToolsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  try {
    await bridge.openDevTools();
  } catch (err) {
    console.error('[node-backend]', 'bridge.openDevTools() failed:', err);
  }
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
