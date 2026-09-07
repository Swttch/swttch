import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { readSessionAsset } from '../features/collectSessionAssets';

/**
 * GET_SESSION_ASSET_DATA — fetch one indexed image's bytes by its coordinate.
 *
 * The counterpart to GET_SESSION_ASSETS, which deliberately answers without any
 * base64. The block's own `source` object is returned untouched, so what the
 * webview receives is exactly what the CLI wrote.
 *
 * A coordinate that no longer resolves answers `status: 'gone'` rather than an
 * error: the session may have been rewound past that entry while the viewer was
 * open, and that is an ordinary outcome, not a failure.
 */
export async function getSessionAssetDataHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const payload = message.payload as
      | { workingDir?: string; sessionId?: string; entryUuid?: string; blockIndex?: number }
      | undefined;
    const workingDir = payload?.workingDir;
    const sessionId = payload?.sessionId;
    const entryUuid = payload?.entryUuid;
    const blockIndex = payload?.blockIndex;

    if (!workingDir || !sessionId || !entryUuid || typeof blockIndex !== 'number') {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: 'workingDir, sessionId, entryUuid and blockIndex are required',
      });
      return;
    }

    const source = await readSessionAsset(workingDir, sessionId, { entryUuid, blockIndex });
    if (!source) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'gone',
      });
      return;
    }

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      source,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
