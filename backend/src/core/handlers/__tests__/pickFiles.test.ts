import { describe, it, expect, vi } from 'vitest';

import { pickFilesHandler } from '../pickFiles';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager & { sendTo: ReturnType<typeof vi.fn> };
}

function createMockBridge(pickFiles: ReturnType<typeof vi.fn>) {
  return { pickFiles } as unknown as Bridge & { pickFiles: ReturnType<typeof vi.fn> };
}

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.PICK_FILES, payload, requestId: 'req-7', timestamp: 0 };
}

describe('pickFilesHandler', () => {
  it('answers with the paths the person chose, on the ACK of that request', async () => {
    const bridge = createMockBridge(vi.fn().mockResolvedValue({ paths: ['/tmp/a.txt'] }));
    const connections = createMockConnections();

    await pickFilesHandler('conn-1', message({ mode: 'files', multiple: true }), connections, bridge);

    expect(bridge.pickFiles).toHaveBeenCalledWith({ mode: 'files', multiple: true });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-7',
      paths: ['/tmp/a.txt'],
    });
  });

  it('answers a cancelled dialog with no paths and no error', async () => {
    const bridge = createMockBridge(vi.fn().mockResolvedValue({ paths: [] }));
    const connections = createMockConnections();

    await pickFilesHandler('conn-1', message({}), connections, bridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-7',
      paths: [],
    });
  });

  // The host's own answer when it cannot open the dialog (the IDE's file chooser threw). The chat
  // toasts `error`, so the person is told instead of seeing the "+" menu do nothing (#623).
  it('tells the chat why when the host could not open the dialog', async () => {
    const bridge = createMockBridge(vi.fn().mockRejectedValue(new Error('The file dialog could not be opened: boom')));
    const connections = createMockConnections();

    await pickFilesHandler('conn-1', message({ mode: 'files' }), connections, bridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-7',
      status: 'error',
      error: 'The file dialog could not be opened: boom',
    });
  });
});
