import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { issueLocalPairCode } from '../features/tunnel-pairing';
import { MessageType } from '../../shared';

/**
 * Issue a fresh single-use pairing code for opening the current session in the
 * SYSTEM BROWSER. The system browser is a separate storage partition from JCEF,
 * so it cannot reuse the JCEF localStorage token — it must redeem its own code.
 *
 * The requesting webview is the LOCAL, already-authenticated operator (its WS
 * connection already passed the auth gate), so handing it a code is safe. Unlike
 * issueTunnelPairing this does NOT require a running tunnel and returns only the
 * raw code — the webview builds the localhost `?pair=` URL from its own origin.
 * The code (never the auth token) is what the browser then redeems at POST /pair.
 */
export async function issueLocalPairingHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const code = issueLocalPairCode();
  // Never log the code. Return it only to the requesting (already-authenticated) webview.
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    code,
  });
}
