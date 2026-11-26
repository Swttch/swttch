import { describe, it, expect, vi } from 'vitest';

import { getPrimarySelectionHandler } from '../getPrimarySelection';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager & { sendTo: ReturnType<typeof vi.fn> };
}

function createMockBridge(getPrimarySelection: ReturnType<typeof vi.fn>) {
  return { getPrimarySelection } as unknown as Bridge & { getPrimarySelection: ReturnType<typeof vi.fn> };
}

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.GET_PRIMARY_SELECTION, payload, requestId: 'req-5', timestamp: 0 };
}

describe('getPrimarySelectionHandler', () => {
  it('answers with the selection the host read, on the ACK of that request', async () => {
    const bridge = createMockBridge(vi.fn().mockResolvedValue('a selected word'));
    const connections = createMockConnections();

    await getPrimarySelectionHandler('conn-1', message({ workingDir: '/proj' }), connections, bridge);

    expect(bridge.getPrimarySelection).toHaveBeenCalledWith({ workingDir: '/proj' });
    expect(connections.sendTo.mock.calls).toEqual([
      ['conn-1', MessageType.ACK, { requestId: 'req-5', text: 'a selected word' }],
    ]);
  });

  it('asks without a project when the webview names an empty one', async () => {
    const bridge = createMockBridge(vi.fn().mockResolvedValue(null));

    await getPrimarySelectionHandler('conn-1', message({ workingDir: '' }), createMockConnections(), bridge);

    expect(bridge.getPrimarySelection).toHaveBeenCalledWith({ workingDir: undefined });
  });

  it('answers with an error when the host cannot be asked, so the browser paste stands', async () => {
    const bridge = createMockBridge(vi.fn().mockRejectedValue(new Error('No IDE host connected')));
    const connections = createMockConnections();

    await getPrimarySelectionHandler('conn-1', message({}), connections, bridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-5',
      status: 'error',
      error: 'No IDE host connected',
    });
  });
});
