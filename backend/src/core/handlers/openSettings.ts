import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';

export async function openSettingsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  try {
    const workingDir = message.payload?.workingDir as string | undefined;
    // Which settings page the new tab should land on (e.g. '/settings/sponsor').
    // Absent → the IDE falls back to the settings landing page.
    const path = message.payload?.path as string | undefined;
    await bridge.openSettings(workingDir, path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[node-backend]', `bridge.openSettings() failed: ${msg}`);
  }
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
