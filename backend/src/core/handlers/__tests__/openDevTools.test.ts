import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openDevToolsHandler } from '../openDevTools';
import { ConnectionManager } from '../../../ws/connection-manager';
import { ClientEnv, MessageType } from '../../../shared';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

function createMockWs() {
  return { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn() } as any;
}

function openDevToolsMessage(): IPCMessage {
  return { type: MessageType.OPEN_DEV_TOOLS, payload: {}, requestId: 'req-1' } as any;
}

/**
 * The settings screen is the only entry point to the embedded browser's DevTools
 * — the plugin binds no key to them, because F12 used to and that swallowed the
 * IDE's own F12 shortcuts (issue #333). So this handler is the whole path.
 */
describe('openDevToolsHandler', () => {
  let connections: ConnectionManager;

  beforeEach(() => {
    connections = new ConnectionManager();
  });

  it('asks the bridge to open DevTools and acks the request', async () => {
    const bridge = { openDevTools: vi.fn() } as unknown as Bridge;
    const connId = connections.addConnection(createMockWs(), ClientEnv.JETBRAINS);
    const sendTo = vi.spyOn(connections, 'sendTo');

    await openDevToolsHandler(connId, openDevToolsMessage(), connections, bridge);

    expect(bridge.openDevTools).toHaveBeenCalledOnce();
    expect(sendTo).toHaveBeenCalledWith(connId, MessageType.ACK, { requestId: 'req-1' });
  });

  it('takes no payload — the action carries no arguments', async () => {
    const bridge = { openDevTools: vi.fn() } as unknown as Bridge;
    const connId = connections.addConnection(createMockWs(), ClientEnv.JETBRAINS);

    await openDevToolsHandler(connId, openDevToolsMessage(), connections, bridge);

    expect(bridge.openDevTools).toHaveBeenCalledWith();
  });

  /**
   * A failure to open must not strand the caller: the webview awaits the ACK, so
   * swallowing the error without one would hang the settings button forever.
   */
  it('still acks when the bridge throws', async () => {
    const bridge = {
      openDevTools: vi.fn().mockRejectedValue(new Error('no browser realized')),
    } as unknown as Bridge;
    const connId = connections.addConnection(createMockWs(), ClientEnv.JETBRAINS);
    const sendTo = vi.spyOn(connections, 'sendTo');

    await openDevToolsHandler(connId, openDevToolsMessage(), connections, bridge);

    expect(sendTo).toHaveBeenCalledWith(connId, MessageType.ACK, { requestId: 'req-1' });
  });
});
