import { describe, it, expect, vi, beforeEach } from 'vitest';

import { showNotificationHandler } from '../showNotification';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

function createMockConnections() {
  return {
    sendTo: vi.fn(),
    broadcastToAll: vi.fn(),
  } as unknown as ConnectionManager;
}

function createMockBridge() {
  return {
    showNotification: vi.fn().mockResolvedValue(undefined),
  } as unknown as Bridge;
}

describe('showNotificationHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards title, body and workingDir to the bridge and acks ok', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge();
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete', workingDir: '/repo' },
      timestamp: 0,
      requestId: 'req-1',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(bridge.showNotification).toHaveBeenCalledWith({
      title: 'My session',
      body: 'Response complete',
      workingDir: '/repo',
    });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', 'ACK', {
      requestId: 'req-1',
      status: 'ok',
    });
  });

  it('defaults body to empty string and drops absent workingDir', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge();
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session' },
      timestamp: 0,
      requestId: 'req-2',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(bridge.showNotification).toHaveBeenCalledWith({
      title: 'My session',
      body: '',
      workingDir: undefined,
    });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', 'ACK', {
      requestId: 'req-2',
      status: 'ok',
    });
  });

  it('rejects when title is missing', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge();
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { body: 'no title' },
      timestamp: 0,
      requestId: 'req-3',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(bridge.showNotification).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', 'ACK', {
      requestId: 'req-3',
      status: 'error',
      error: 'Missing or invalid title',
    });
  });

  it('surfaces the underlying error message when the bridge throws', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge();
    vi.mocked(bridge.showNotification).mockRejectedValue(new Error('No RPC client connected'));
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete' },
      timestamp: 0,
      requestId: 'req-4',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', 'ACK', {
      requestId: 'req-4',
      status: 'error',
      error: 'No RPC client connected',
    });
  });
});
