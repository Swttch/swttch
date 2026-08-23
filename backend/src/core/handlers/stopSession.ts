import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { sendInterruptToProcess } from '../claude-process';
import { Claude } from '../claude';
import { MessageType } from '../../shared';

/**
 * Interrupt the current turn, leaving background tasks alone.
 *
 * Escape stops the foreground turn only, matching the CLI: there, Escape ends
 * the turn while background tasks keep running, and cancelling one is a
 * separate action (issue #330). We used to settle every running workflow of the
 * session here, so a single Escape also wiped the Background tasks panel.
 *
 * Nothing is left hanging on "running" by not settling here: when the CLI
 * process actually dies its `close` handler calls `workflowTracker.stopSession`,
 * which settles and drops the entries. That is the case this cleanup was for —
 * a live process still reports its own `task_notification`.
 */
export function stopSessionHandler(
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
      console.error('[node-backend]', `Interrupting session ${sessionId} via stdin control_request`);
      // SIGTERM 대신 stdin으로 interrupt를 보내서 graceful하게 중단.
      // CLI는 현재 턴을 중단하되, stdin 버퍼에 대기 중인 메시지는 계속 처리한다.
      const sent = sendInterruptToProcess(connections, sessionId);
      if (!sent) {
        // stdin이 이미 닫혀있으면 fallback으로 SIGTERM
        console.error('[node-backend]', `Interrupt failed, falling back to SIGTERM for ${sessionId}`);
        Claude.killTree(session.process);
      }
    }
  }
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}
