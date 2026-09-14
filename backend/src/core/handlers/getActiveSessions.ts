import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { listActiveSessions } from '../features/listActiveSessions';

/**
 * GET_ACTIVE_SESSIONS — the Claude sessions running on this machine right now.
 *
 * Answers the `@@` panel in the composer. The whole `claude agents --json`
 * array travels on, including the session asking: which row is "me" is decided
 * in the webview, which already knows the session it is showing. Dropping it
 * here would edit the CLI's list before anyone saw it, and would make a later
 * "show my other tabs too" a backend change rather than a UI one.
 *
 * `workingDir` only picks the directory the CLI runs in. The list is
 * machine-wide either way, and that is deliberate: a session in another project
 * is exactly the one worth reaching from here.
 */
export async function getActiveSessionsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const workingDir = (message.payload as { workingDir?: string })?.workingDir;
    const result = await listActiveSessions(workingDir);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      agents: result.agents,
      entries: result.entries,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
