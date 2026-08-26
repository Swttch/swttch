import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';

/**
 * Record the name the user typed for their own tab.
 *
 * The panel is taken from the connection rather than from the message, so a
 * webview can only rename the tab it *is*. Nothing here decides what the label
 * becomes — the IDE side owns that, because it must be able to label a restored
 * tab before the tab's webview exists (issue #301).
 *
 * An empty name is a real value, not a missing one: it clears the manual name
 * and returns the tab to following its conversation title.
 */
export async function setTabNameHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  try {
    const panelId = connections.getPanelIdByConnectionId(connectionId);
    const name = typeof message.payload?.name === 'string' ? message.payload.name : '';
    if (panelId) {
      await bridge.setTabName(panelId, name);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[node-backend]', `bridge.setTabName() failed: ${msg}`);
  }

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
