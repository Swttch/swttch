import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import { openFileHandler } from '../openFile';
import { ConnectionManager } from '../../../ws/connection-manager';
import { ClientEnv, MessageType } from '../../../shared';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }));
const mockExistsSync = vi.mocked(existsSync);

function createMockWs() {
  return { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn() } as any;
}

function createBrowserBridge(): Bridge {
  return { openFile: vi.fn() } as any;
}

function createJetBrainsBridge(connected: boolean): Bridge {
  return { openFile: vi.fn(), isConnected: vi.fn().mockReturnValue(connected) } as any;
}

function openFileMessage(): IPCMessage {
  return {
    type: MessageType.OPEN_FILE,
    payload: { filePath: '/abs/src/x.ts', line: 42, column: 5 },
    requestId: 'req-1',
  } as any;
}

describe('openFileHandler — browser client routes to the IDE when one is attached', () => {
  let connections: ConnectionManager;

  beforeEach(() => {
    connections = new ConnectionManager();
    mockExistsSync.mockReturnValue(true);
  });

  it('routes a browser client to the IDE bridge when an IDE is connected', async () => {
    const browser = createBrowserBridge();
    const jetbrains = createJetBrainsBridge(true);
    const bridges = { [ClientEnv.BROWSER]: browser, [ClientEnv.JETBRAINS]: jetbrains };
    const connId = connections.addConnection(createMockWs(), ClientEnv.BROWSER);

    await openFileHandler(connId, openFileMessage(), connections, browser, bridges);

    expect(jetbrains.openFile).toHaveBeenCalledWith('/abs/src/x.ts', 42, 5, undefined);
    expect(browser.openFile).not.toHaveBeenCalled();
  });

  it('falls back to the browser bridge (OS opener) when no IDE is connected', async () => {
    const browser = createBrowserBridge();
    const jetbrains = createJetBrainsBridge(false);
    const bridges = { [ClientEnv.BROWSER]: browser, [ClientEnv.JETBRAINS]: jetbrains };
    const connId = connections.addConnection(createMockWs(), ClientEnv.BROWSER);

    await openFileHandler(connId, openFileMessage(), connections, browser, bridges);

    expect(browser.openFile).toHaveBeenCalledWith('/abs/src/x.ts', 42, 5, undefined);
    expect(jetbrains.openFile).not.toHaveBeenCalled();
  });

  it('a JCEF client always uses its own JetBrains bridge', async () => {
    const browser = createBrowserBridge();
    const jetbrains = createJetBrainsBridge(true);
    const bridges = { [ClientEnv.BROWSER]: browser, [ClientEnv.JETBRAINS]: jetbrains };
    const connId = connections.addConnection(createMockWs(), ClientEnv.JETBRAINS);

    // For a JCEF connection the caller passes the JetBrains bridge as `bridge`.
    await openFileHandler(connId, openFileMessage(), connections, jetbrains, bridges);

    expect(jetbrains.openFile).toHaveBeenCalledWith('/abs/src/x.ts', 42, 5, undefined);
    expect(browser.openFile).not.toHaveBeenCalled();
  });

  it('does not open and acks ok:false when the file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const browser = createBrowserBridge();
    const jetbrains = createJetBrainsBridge(true);
    const bridges = { [ClientEnv.BROWSER]: browser, [ClientEnv.JETBRAINS]: jetbrains };
    const ws = createMockWs();
    const connId = connections.addConnection(ws, ClientEnv.BROWSER);

    await openFileHandler(connId, openFileMessage(), connections, browser, bridges);

    expect(browser.openFile).not.toHaveBeenCalled();
    expect(jetbrains.openFile).not.toHaveBeenCalled();
    const ack = String(ws.send.mock.calls[0][0]);
    expect(ack).toContain(MessageType.ACK);
    expect(ack).toContain('"ok":false');
    expect(ack).toContain('not-found');
  });

  it('acknowledges the request', async () => {
    const browser = createBrowserBridge();
    const jetbrains = createJetBrainsBridge(false);
    const bridges = { [ClientEnv.BROWSER]: browser, [ClientEnv.JETBRAINS]: jetbrains };
    const ws = createMockWs();
    const connId = connections.addConnection(ws, ClientEnv.BROWSER);

    await openFileHandler(connId, openFileMessage(), connections, browser, bridges);

    expect(ws.send).toHaveBeenCalled();
    expect(String(ws.send.mock.calls[0][0])).toContain(MessageType.ACK);
  });
});
