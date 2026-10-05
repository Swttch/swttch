import { describe, it, expect, vi } from 'vitest';

import { setPrimarySelectionHandler } from '../setPrimarySelection';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}

function createMockBridge(setPrimarySelection = vi.fn().mockResolvedValue(undefined)) {
  return { setPrimarySelection } as unknown as Bridge & {
    setPrimarySelection: ReturnType<typeof vi.fn>;
  };
}

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.SET_PRIMARY_SELECTION, payload, timestamp: 0 };
}

describe('setPrimarySelectionHandler', () => {
  it('hands the selected text and its project to the bridge', async () => {
    const bridge = createMockBridge();

    await setPrimarySelectionHandler(
      'conn-1',
      message({ text: 'model', workingDir: '/proj' }),
      createMockConnections(),
      bridge,
    );

    expect(bridge.setPrimarySelection).toHaveBeenCalledTimes(1);
    expect(bridge.setPrimarySelection).toHaveBeenCalledWith({ text: 'model', workingDir: '/proj' });
  });

  it('leaves the project out when the webview sent none, so the bridge routes to the first IDE', async () => {
    const bridge = createMockBridge();

    await setPrimarySelectionHandler(
      'conn-1',
      message({ text: 'model', workingDir: '' }),
      createMockConnections(),
      bridge,
    );

    expect(bridge.setPrimarySelection).toHaveBeenCalledWith({ text: 'model', workingDir: undefined });
  });

  it('passes the text through untouched, including whitespace and newlines', async () => {
    const bridge = createMockBridge();
    const text = '  first line\n\tsecond line  ';

    await setPrimarySelectionHandler('conn-1', message({ text }), createMockConnections(), bridge);

    expect(bridge.setPrimarySelection).toHaveBeenCalledWith({ text, workingDir: undefined });
  });

  it.each([
    ['empty text', { text: '' }],
    ['missing text', {}],
    ['text that is not a string', { text: 42 }],
  ])('drops %s, since dropping a selection must not empty the buffer the user can still paste', async (_name, payload) => {
    const bridge = createMockBridge();

    await setPrimarySelectionHandler('conn-1', message(payload), createMockConnections(), bridge);

    expect(bridge.setPrimarySelection).not.toHaveBeenCalled();
  });

  it('answers nothing, because the webview reports a selection and does not wait for it', async () => {
    const connections = createMockConnections();

    await setPrimarySelectionHandler('conn-1', message({ text: 'model' }), connections, createMockBridge());

    expect(connections.sendTo).not.toHaveBeenCalled();
  });

  it('swallows a bridge failure, since an unplaced selection is not worth failing the connection for', async () => {
    const bridge = createMockBridge(vi.fn().mockRejectedValue(new Error('no RPC client')));

    await expect(
      setPrimarySelectionHandler('conn-1', message({ text: 'model' }), createMockConnections(), bridge),
    ).resolves.toBeUndefined();
  });
});
