import { describe, expect, it, vi } from 'vitest';

import { setClipboardHandler } from '../setClipboard';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager & { sendTo: ReturnType<typeof vi.fn> };
}

function createMockBridge(setClipboard = vi.fn().mockResolvedValue(undefined)) {
  return { setClipboard } as unknown as Bridge & { setClipboard: ReturnType<typeof vi.fn> };
}

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.SET_CLIPBOARD, payload, requestId: 'req-4', timestamp: 0 };
}

describe('setClipboardHandler', () => {
  it('hands copied text and its project to the bridge, and answers with an empty ACK once it is placed', async () => {
    const bridge = createMockBridge();
    const connections = createMockConnections();

    await setClipboardHandler(
      'conn-1',
      message({ text: 'copied from chat', workingDir: '/proj' }),
      connections,
      bridge,
    );

    expect(bridge.setClipboard).toHaveBeenCalledWith({ text: 'copied from chat', workingDir: '/proj' });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, { requestId: 'req-4' });
  });

  it('passes the text through untouched, whitespace and newlines included', async () => {
    const bridge = createMockBridge();

    await setClipboardHandler('conn-1', message({ text: '  a\n\tb  ' }), createMockConnections(), bridge);

    expect(bridge.setClipboard).toHaveBeenCalledWith({ text: '  a\n\tb  ', workingDir: undefined });
  });

  it('asks without a project when the webview names none, and when it names an empty one', async () => {
    const bridge = createMockBridge();

    await setClipboardHandler('conn-1', message({ text: 'x' }), createMockConnections(), bridge);
    await setClipboardHandler('conn-1', message({ text: 'x', workingDir: '' }), createMockConnections(), bridge);

    expect(bridge.setClipboard).toHaveBeenNthCalledWith(1, { text: 'x', workingDir: undefined });
    expect(bridge.setClipboard).toHaveBeenNthCalledWith(2, { text: 'x', workingDir: undefined });
  });

  it.each([
    ['empty text', { text: '' }],
    ['missing text', {}],
    ['non-string text', { text: 42 }],
  ])('drops %s without touching the host clipboard, and still answers so the copy does not wait', async (_name, payload) => {
    const bridge = createMockBridge();
    const connections = createMockConnections();

    await setClipboardHandler('conn-1', message(payload), connections, bridge);

    expect(bridge.setClipboard).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, { requestId: 'req-4' });
  });

  it('answers an error when the host could not place the text, so the webview can tell the user', async () => {
    const bridge = createMockBridge(vi.fn().mockRejectedValue(new Error('no RPC client')));
    const connections = createMockConnections();

    await expect(
      setClipboardHandler('conn-1', message({ text: 'copied' }), connections, bridge),
    ).resolves.toBeUndefined();

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-4',
      status: 'error',
      error: 'no RPC client',
    });
  });
});
