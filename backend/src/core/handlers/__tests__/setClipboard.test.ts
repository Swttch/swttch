import { describe, expect, it, vi } from 'vitest';

import { setClipboardHandler } from '../setClipboard';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}

function createMockBridge(setClipboard = vi.fn().mockResolvedValue(undefined)) {
  return { setClipboard } as unknown as Bridge & { setClipboard: ReturnType<typeof vi.fn> };
}

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.SET_CLIPBOARD, payload, timestamp: 0 };
}

describe('setClipboardHandler', () => {
  it('hands copied text and its project to the bridge', async () => {
    const bridge = createMockBridge();

    await setClipboardHandler(
      'conn-1',
      message({ text: 'copied from chat', workingDir: '/proj' }),
      createMockConnections(),
      bridge,
    );

    expect(bridge.setClipboard).toHaveBeenCalledWith({ text: 'copied from chat', workingDir: '/proj' });
  });

  it.each([
    ['empty text', { text: '' }],
    ['missing text', {}],
    ['non-string text', { text: 42 }],
  ])('drops %s without touching the host clipboard', async (_name, payload) => {
    const bridge = createMockBridge();

    await setClipboardHandler('conn-1', message(payload), createMockConnections(), bridge);

    expect(bridge.setClipboard).not.toHaveBeenCalled();
  });

  it('does not answer because clipboard reporting is fire-and-forget', async () => {
    const connections = createMockConnections();

    await setClipboardHandler('conn-1', message({ text: 'copied' }), connections, createMockBridge());

    expect(connections.sendTo).not.toHaveBeenCalled();
  });

  it('swallows a host failure so copying cannot break the webview connection', async () => {
    const bridge = createMockBridge(vi.fn().mockRejectedValue(new Error('no RPC client')));

    await expect(
      setClipboardHandler('conn-1', message({ text: 'copied' }), createMockConnections(), bridge),
    ).resolves.toBeUndefined();
  });
});
