import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { runExtApi } from '../extend-kit';

/**
 * RUN_EXT_API: one `swttch-ext api` call, as {service, call, params, yes}. Answered with the kit's own
 * {ok, data} or {ok:false, error}, so what the chat shows is what a terminal would print.
 */
export async function runExtApiHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const { service, call, params, yes, workingDir } = message.payload ?? {};
  const strings =
    params && typeof params === 'object'
      ? Object.fromEntries(Object.entries(params as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>
      : {};

  const answer =
    typeof service === 'string' && typeof call === 'string' && /^[a-z][a-z0-9-]*$/.test(service) && /^[a-z][a-z0-9-]*$/.test(call)
      ? await runExtApi(service, call, strings, { yes: yes === true, workingDir: typeof workingDir === 'string' ? workingDir : undefined })
      : ({ ok: false, error: { code: 'invalid_argument', message: 'service and call are required' } } as const);

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...answer });
}
