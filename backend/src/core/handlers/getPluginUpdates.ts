import type { ConnectionManager } from '../../ws/connection-manager';
import { proxiedRequest } from '../features/outbound-proxy';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';

const CACHE_TTL_MS = 60_000;
let cachedUpdates: unknown = null;
let cachedAt = 0;
let inflightPromise: Promise<unknown> | null = null;

export async function getPluginUpdatesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  if (cachedUpdates !== null && Date.now() - cachedAt < CACHE_TTL_MS) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      updates: cachedUpdates,
    });
    return;
  }

  try {
    if (inflightPromise !== null) {
      try {
        await inflightPromise;
      } catch {
        // absorb inflight rejection; respond based on cachedUpdates
      }
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: cachedUpdates !== null ? 'ok' : 'error',
        ...(cachedUpdates !== null
          ? { updates: cachedUpdates }
          : { error: 'Plugin updates fetch failed' }),
      });
      return;
    }

    inflightPromise = (async () => {
      // proxiedRequest, not fetch: the global fetch ignores HTTP_PROXY, so the machines
      // most likely to sit behind one were also the ones never told an update existed.
      const response = await proxiedRequest(
        'https://plugins.jetbrains.com/api/plugins/30313/updates?size=20',
        { method: 'GET' },
      );

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const updates = JSON.parse(response.body);
      cachedUpdates = updates;
      cachedAt = Date.now();
      return updates;
    })();

    const updates = await inflightPromise;

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      updates,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    inflightPromise = null;
  }
}
