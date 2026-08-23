import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { sendInterruptToProcess } from '../claude-process';
import { Claude } from '../claude';
import { MessageType } from '../../shared';

/**
 * Interrupt the current turn, leaving background tasks alone.
 *
 * Same contract as {@link stopSessionHandler} — see the note there on why
 * background workflows are not settled on an interrupt (issue #330).
 */
export function stopGenerationHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const client = connections.getClient(connectionId);
  if (client?.subscribedSessionId) {
    const sessionId = client.subscribedSessionId;
    const session = connections.getSession(sessionId);
    if (session?.process) {
      console.error('[node-backend]', `Interrupting generation for session ${sessionId} via stdin control_request`);
      const sent = sendInterruptToProcess(connections, sessionId);
      if (!sent) {
        console.error('[node-backend]', `Interrupt failed, falling back to SIGTERM for ${sessionId}`);
        Claude.killTree(session.process);
      }
    }
  }
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
