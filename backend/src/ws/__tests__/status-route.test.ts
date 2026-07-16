import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionManager } from '../connection-manager';
import { handleStatusRequest } from '../status-route';
import { ClientEnv } from '../../shared';

vi.mock('../../core/claude', () => ({
  Claude: { killTree: vi.fn() },
}));

function createMockWs(readyState = 1) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as import('ws').WebSocket;
}

describe('handleStatusRequest', () => {
  let cm: ConnectionManager;

  beforeEach(() => {
    cm = new ConnectionManager();
  });

  it('returns 200 with the empty-backend snapshot', () => {
    const result = handleStatusRequest(cm);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      keepAlive: false,
      connections: { total: 0, panels: 0, tunnels: 0, browsers: 0 },
      sessions: { total: 0, streaming: 0 },
    });
  });

  it('reflects gate state, connection breakdown and session counters', () => {
    cm.setKeepAlive(true);
    cm.addConnection(createMockWs(), ClientEnv.JETBRAINS, 'panel-1', null);
    const browserConn = cm.addConnection(createMockWs(), ClientEnv.BROWSER, null, 'http://localhost:63412');
    cm.addConnection(createMockWs(), ClientEnv.BROWSER, null, 'https://x.trycloudflare.com');

    cm.subscribe(browserConn, 'sess-1');
    cm.getOrCreateSession('sess-2');
    cm.setStreaming('sess-1', true);

    expect(handleStatusRequest(cm).body).toEqual({
      keepAlive: true,
      connections: { total: 3, panels: 1, tunnels: 1, browsers: 1 },
      sessions: { total: 2, streaming: 1 },
    });
  });
});
