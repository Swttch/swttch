import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/detectEditors', () => ({
  detectInstalledEditors: vi.fn(),
}));

import { getAvailableEditorsHandler } from '../getAvailableEditors';
import { detectInstalledEditors } from '../../features/detectEditors';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

function createMockConnections() {
  return {
    sendTo: vi.fn(),
  } as unknown as ConnectionManager;
}

describe('getAvailableEditorsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acks with the editors array detected on the host', async () => {
    const editors = [
      { id: 'vscode', name: 'Visual Studio Code', path: '/Applications/Visual Studio Code.app' },
      { id: 'cursor', name: 'Cursor', path: '/Applications/Cursor.app' },
    ];
    vi.mocked(detectInstalledEditors).mockResolvedValue(editors);

    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.GET_AVAILABLE_EDITORS,
      payload: {},
      timestamp: 0,
      requestId: 'req-1',
    };

    await getAvailableEditorsHandler('conn-1', message, connections, {} as Bridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      editors,
    });
  });
});
