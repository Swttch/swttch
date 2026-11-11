import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getCloudflaredVersion, isCloudflaredAvailable } from '../features/tunnel-manager';
import { MessageType } from '../../shared';

/**
 * Report whether the tunnel's prerequisites are met (currently: cloudflared is
 * locatable without installing). The UI calls this when the tunnel modal opens
 * so it can warn the user before they toggle the tunnel on.
 *
 * `payload.version` also asks which cloudflared that is, for the Dependencies list in About.
 * It is opt-in because it runs the binary, which the tunnel modal has no use for.
 */
export async function getTunnelPrereqsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  if ((message.payload as { version?: boolean } | undefined)?.version) {
    const cloudflared = await getCloudflaredVersion();
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      cloudflaredAvailable: cloudflared.installed,
      cloudflaredVersion: cloudflared.version,
    });
    return;
  }
  const cloudflaredAvailable = await isCloudflaredAvailable();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    cloudflaredAvailable,
  });
}
