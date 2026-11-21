import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionManager } from '../connection-manager';
import { ClientEnv } from '../../shared';
import type { Bridge } from '../../bridge/bridge-interface';

function createMockWs() {
  return {
    readyState: 1,
    send: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  } as any;
}

function createMockBridge(name: string): Bridge {
  return {
    openFile: vi.fn(),
    openDiff: vi.fn(),
    applyDiff: vi.fn().mockResolvedValue({ applied: false }),
    rejectDiff: vi.fn(),
    refreshFiles: vi.fn(),
    createSession: vi.fn(),
    newTab: vi.fn(),
    openTab: vi.fn(),
    openTerminal: vi.fn(),
    openUrl: vi.fn(),
    pickFiles: vi.fn().mockResolvedValue({ paths: [] }),
    updatePlugin: vi.fn(),
    requiresRestart: vi.fn().mockResolvedValue(false),
    _name: name,
  } as any;
}

describe('Connection-based bridge routing', () => {
  let connections: ConnectionManager;

  beforeEach(() => {
    connections = new ConnectionManager();
  });

  it('should store client env on addConnection', () => {
    const ws = createMockWs();
    const connId = connections.addConnection(ws, ClientEnv.JETBRAINS);

    expect(connections.getClientEnv(connId)).toBe(ClientEnv.JETBRAINS);
  });

  it('should default to BROWSER when no env is specified', () => {
    const ws = createMockWs();
    const connId = connections.addConnection(ws);

    expect(connections.getClientEnv(connId)).toBe(ClientEnv.BROWSER);
  });

  it('should route to correct bridge based on connection env', () => {
    const browserBridge = createMockBridge('browser');
    const jetbrainsBridge = createMockBridge('jetbrains');
    const bridges: Record<ClientEnv, Bridge> = {
      [ClientEnv.BROWSER]: browserBridge,
      [ClientEnv.JETBRAINS]: jetbrainsBridge,
    };

    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const browserConn = connections.addConnection(ws1, ClientEnv.BROWSER);
    const jetbrainsConn = connections.addConnection(ws2, ClientEnv.JETBRAINS);

    const bridgeForBrowser = bridges[connections.getClientEnv(browserConn)];
    const bridgeForJetbrains = bridges[connections.getClientEnv(jetbrainsConn)];

    expect(bridgeForBrowser).toBe(browserBridge);
    expect(bridgeForJetbrains).toBe(jetbrainsBridge);
  });

  it('should return BROWSER for unknown connection id', () => {
    expect(connections.getClientEnv('nonexistent')).toBe(ClientEnv.BROWSER);
  });

  it('should handle multiple connections with different envs simultaneously', () => {
    const browserWs1 = createMockWs();
    const browserWs2 = createMockWs();
    const jetbrainsWs = createMockWs();

    const conn1 = connections.addConnection(browserWs1, ClientEnv.BROWSER);
    const conn2 = connections.addConnection(browserWs2, ClientEnv.BROWSER);
    const conn3 = connections.addConnection(jetbrainsWs, ClientEnv.JETBRAINS);

    expect(connections.getClientEnv(conn1)).toBe(ClientEnv.BROWSER);
    expect(connections.getClientEnv(conn2)).toBe(ClientEnv.BROWSER);
    expect(connections.getClientEnv(conn3)).toBe(ClientEnv.JETBRAINS);
  });
});
