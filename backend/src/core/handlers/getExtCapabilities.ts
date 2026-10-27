import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { getExtCapabilities } from '../extend-kit';

/**
 * GET_EXT_CAPABILITIES: what the installed kit's `swttch-ext` can do, as {installed, capabilities, version}.
 * The chat reads it to decide which artifact menu items to offer. A kit that could not be run answers
 * `error`, not an empty list.
 */
export async function getExtCapabilitiesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDir = typeof message.payload?.workingDir === 'string' ? message.payload.workingDir : undefined;
  try {
    const answer = await getExtCapabilities(workingDir);
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok', ...answer });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
