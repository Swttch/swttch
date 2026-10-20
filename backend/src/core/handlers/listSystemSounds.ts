import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { scanSystemSounds } from '../../system-sounds';
import { assertPowerShellUsable } from '../win-job';
import { MessageType } from '../../shared';

export async function listSystemSoundsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    // Windows plays sounds through PowerShell. Listing sounds nobody can play would leave a
    // dropdown that accepts a choice and then stays silent, so the list itself says why not.
    if (process.platform === 'win32') assertPowerShellUsable('Playing a sound');
    const sounds = await scanSystemSounds();
    // Strip absolute path before sending to client; expose id/label only.
    const safe = sounds.map(({ id, label }) => ({ id, label }));
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      sounds: safe,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'listSystemSounds failed:', err);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error,
    });
  }
}
