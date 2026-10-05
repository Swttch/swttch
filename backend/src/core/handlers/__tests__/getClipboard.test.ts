import { describe, it, expect, vi } from 'vitest';

import { getClipboardHandler } from '../getClipboard';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager & { sendTo: ReturnType<typeof vi.fn> };
}

function createMockBridge(getClipboard: ReturnType<typeof vi.fn>) {
  return { getClipboard } as unknown as Bridge & { getClipboard: ReturnType<typeof vi.fn> };
}

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.GET_CLIPBOARD, payload, requestId: 'req-9', timestamp: 0 };
}

describe('getClipboardHandler', () => {
  it('answers the request with the text the host read, on the ACK of that request', async () => {
    const bridge = createMockBridge(vi.fn().mockResolvedValue({ text: 'copied elsewhere', image: null }));
    const connections = createMockConnections();

    await getClipboardHandler('conn-1', message({ workingDir: '/proj' }), connections, bridge);

    expect(bridge.getClipboard).toHaveBeenCalledWith({ workingDir: '/proj' });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-9',
      text: 'copied elsewhere',
      image: null,
    });
  });

  it('passes an image through untouched', async () => {
    const image = { mimeType: 'image/png', base64: 'iVBORw0KGgo=' };
    const bridge = createMockBridge(vi.fn().mockResolvedValue({ text: null, image }));
    const connections = createMockConnections();

    await getClipboardHandler('conn-1', message({}), connections, bridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-9',
      text: null,
      image,
    });
  });

  it('asks without a project when the webview names none, and when it names an empty one', async () => {
    const bridge = createMockBridge(vi.fn().mockResolvedValue({ text: null, image: null }));

    await getClipboardHandler('conn-1', message({}), createMockConnections(), bridge);
    await getClipboardHandler('conn-1', message({ workingDir: '' }), createMockConnections(), bridge);

    expect(bridge.getClipboard).toHaveBeenNthCalledWith(1, { workingDir: undefined });
    expect(bridge.getClipboard).toHaveBeenNthCalledWith(2, { workingDir: undefined });
  });

  it('ends the webview paste with an error answer when the host cannot be asked, instead of leaving it waiting', async () => {
    const bridge = createMockBridge(vi.fn().mockRejectedValue(new Error('No IDE host connected')));
    const connections = createMockConnections();

    await getClipboardHandler('conn-1', message({ workingDir: '/proj' }), connections, bridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-9',
      status: 'error',
      error: 'No IDE host connected',
    });
  });
});
