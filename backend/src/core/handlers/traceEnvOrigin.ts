import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { traceEnvVarOrigins } from '../features/env-var-origin';
import { MessageType } from '../../shared';

/**
 * Answer "where is this environment variable set?" for the auth-failure notice.
 *
 * A user who is told their request authenticated with `ANTHROPIC_API_KEY` still has
 * to find the thing. It might be in a shell startup file they wrote years ago, a
 * project `.env`, Claude's own settings, or nowhere on disk at all because it was
 * typed inline on the command line that launched the IDE. Guessing is worse than
 * silence, so the backend actually looks.
 *
 * Returns locations only. The value never leaves the backend — see EnvVarOrigin.
 */
export async function traceEnvOriginHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const name = message.payload?.name as string | undefined;
  const workingDir = message.payload?.workingDir as string | undefined;

  const origins = name ? await traceEnvVarOrigins(name, workingDir) : [];

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    origins,
  });
}
