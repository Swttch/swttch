import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { getProjectSessionsPath } from '../features/getProjectSessionsPath';
import { listActiveSessions } from '../features/listActiveSessions';
import { swttchEntrypointName, updateSessionsEntrypoint } from '../features/sessionEntrypoint';

/**
 * UPDATE_SESSIONS_ENTRYPOINT — move the sessions of one project folder that carry `sdk-cli` to this app's own
 * entrypoint, so Claude Desktop's "Import Claude Code CLI sessions" lists them (#647).
 *
 * The sessions a CLI is running are left alone, because a running CLI keeps its transcript open and would go on
 * appending to the file this replaces. Which ones run is read from `claude agents --json`, the official list. When
 * that cannot be read the whole request is refused: guessing would risk exactly the loss it is there to prevent.
 */
export async function updateSessionsEntrypointHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDir = message.payload?.workingDir as string | undefined;
  if (!workingDir) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'workingDir is required',
    });
    return;
  }

  try {
    const { agents } = await listActiveSessions(workingDir);
    const running = new Set(
      agents.map((agent) => agent?.sessionId).filter((sessionId): sessionId is string => typeof sessionId === 'string'),
    );
    const sessionsDir = await getProjectSessionsPath(workingDir);
    const result = await updateSessionsEntrypoint(
      sessionsDir,
      swttchEntrypointName(process.env.JETBRAINS_MODE === 'true'),
      running,
    );
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok', ...result });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
