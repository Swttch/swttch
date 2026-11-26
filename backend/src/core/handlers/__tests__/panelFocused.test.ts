import { describe, it, expect, vi } from 'vitest';

import { panelFocusedHandler } from '../panelFocused';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

function createMockConnections() {
  return {
    setLastFocusedPanelId: vi.fn(),
  } as unknown as ConnectionManager;
}

const mockBridge = {} as Bridge;

describe('panelFocusedHandler', () => {
  it('stores the reported panelId and the view that reported it as last focused', () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.PANEL_FOCUSED,
      payload: { panelId: 'panel-1' },
      timestamp: 0,
    };

    panelFocusedHandler('conn-1', message, connections, mockBridge);

    expect(connections.setLastFocusedPanelId).toHaveBeenCalledTimes(1);
    expect(connections.setLastFocusedPanelId).toHaveBeenCalledWith('panel-1', 'conn-1');
  });

  it('ignores the message when panelId is missing', () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.PANEL_FOCUSED,
      payload: {},
      timestamp: 0,
    };

    panelFocusedHandler('conn-1', message, connections, mockBridge);

    expect(connections.setLastFocusedPanelId).not.toHaveBeenCalled();
  });

  it('ignores the message when panelId is not a non-empty string', () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.PANEL_FOCUSED,
      payload: { panelId: '' },
      timestamp: 0,
    };

    panelFocusedHandler('conn-1', message, connections, mockBridge);

    expect(connections.setLastFocusedPanelId).not.toHaveBeenCalled();
  });
});
