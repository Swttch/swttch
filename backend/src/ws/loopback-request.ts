import type { ConnectionManager } from './connection-manager';
import type { BridgeMap, MessageHandler } from './ws-server';
import type { IPCMessage } from '../core/types';
import { MessageType } from '../shared';

/**
 * Send a message into the backend's router the way a webview does, and resolve its ACK.
 *
 * For work the backend starts on its own that must behave exactly like the same work
 * started from the UI: it enters through the same `handleMessage`, reaches the same handler
 * with the same payload, and gets the same reply. Nothing on the way can tell the two apart,
 * so the two cannot drift.
 *
 * The router is passed in rather than imported, because the handlers it dispatches to are the
 * callers of this module.
 */
export function createLoopbackRequest(
  connections: ConnectionManager,
  bridges: BridgeMap,
  handleMessage: MessageHandler,
): (type: MessageType, payload?: Record<string, unknown>) => Promise<Record<string, unknown>> {
  let nextRequest = 0;

  return (type, payload = {}) => new Promise((resolve, reject) => {
    const requestId = `loopback-request-${nextRequest++}`;
    const connectionId = connections.openLoopback((replyType, reply) => {
      if (replyType !== MessageType.ACK || reply.requestId !== requestId) return;
      connections.closeLoopback(connectionId);
      resolve(reply);
    });

    const message: IPCMessage = { type, payload, requestId, timestamp: Date.now() };
    const bridge = bridges[connections.getClientEnv(connectionId)];
    Promise.resolve(handleMessage(connectionId, message, connections, bridge, bridges)).catch((error) => {
      connections.closeLoopback(connectionId);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}
