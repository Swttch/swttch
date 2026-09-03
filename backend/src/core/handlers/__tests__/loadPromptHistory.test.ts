import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/loadPromptHistory', () => ({
  loadPromptHistory: vi.fn(),
}));

import { loadPromptHistoryHandler } from '../loadPromptHistory';
import { loadPromptHistory } from '../../features/loadPromptHistory';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}

function message(payload: Record<string, unknown>): IPCMessage {
  return {
    type: MessageType.LOAD_PROMPT_HISTORY,
    payload,
    timestamp: 0,
    requestId: 'req-1',
  };
}

describe('loadPromptHistoryHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('acks with the page on success', async () => {
    vi.mocked(loadPromptHistory).mockResolvedValue({
      entries: [{ type: 'user', uuid: 'u1' }],
      hasMore: true,
      oldestUuid: 'u1',
    });
    const connections = createMockConnections();

    await loadPromptHistoryHandler(
      'conn-1',
      message({ workingDir: '/w', sessionId: 's1', beforeUuid: 'u9' }),
      connections,
      {} as Bridge,
    );

    expect(loadPromptHistory).toHaveBeenCalledWith('/w', 's1', 'u9', undefined);
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      entries: [{ type: 'user', uuid: 'u1' }],
      hasMore: true,
      oldestUuid: 'u1',
    });
  });

  it('rejects a request missing workingDir or sessionId without loading', async () => {
    const connections = createMockConnections();

    await loadPromptHistoryHandler('conn-1', message({ sessionId: 's1' }), connections, {} as Bridge);

    expect(loadPromptHistory).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'workingDir and sessionId are required',
    });
  });

  it('acks with an error rather than throwing when the load fails', async () => {
    vi.mocked(loadPromptHistory).mockRejectedValue(new Error('boom'));
    const connections = createMockConnections();

    await loadPromptHistoryHandler(
      'conn-1',
      message({ workingDir: '/w', sessionId: 's1' }),
      connections,
      {} as Bridge,
    );

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'boom',
    });
  });
});
