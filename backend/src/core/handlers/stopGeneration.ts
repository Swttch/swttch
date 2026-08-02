import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { sendInterruptToProcess, stopWorkflowsForSession } from '../claude-process';
import { Claude } from '../claude';
import { MessageType } from '../../shared';

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
      // Settle any background workflows the interrupt just cancelled so the panel
      // doesn't leave them hanging on "running".
      stopWorkflowsForSession(sessionId);
    }
  }
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
