import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { collectSessionAssets } from '../features/collectSessionAssets';

/**
 * GET_SESSION_ASSETS — index every image the user attached in one session.
 *
 * Exists because the chat transcript is paged: the webview only holds the newest
 * slice, so an image attached earlier in a long session is simply not there to
 * step to. This answers for the whole session at once, without the base64.
 *
 * No sponsor gate here, deliberately. What sponsorship unlocks is stepping ACROSS
 * the session in the viewer — not seeing the images, which everyone does on the
 * Assets screen, thumbnails and all. Gating this would blank that screen for
 * non-sponsors and move the line the product actually drew.
 *
 * That makes it ensureSponsor's "pattern B": the gated effect happens in the
 * frontend and there is no backend request that could carry it. SCHEDULE_MESSAGE
 * is gated (pattern A) because the backend is what creates the reservation;
 * here the backend only reads what the user already owns.
 */
export async function getSessionAssetsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const payload = message.payload as { workingDir?: string; sessionId?: string } | undefined;
    const workingDir = payload?.workingDir;
    const sessionId = payload?.sessionId;

    if (!workingDir || !sessionId) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: 'workingDir and sessionId are required',
      });
      return;
    }

    const assets = await collectSessionAssets(workingDir, sessionId);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      assets,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
