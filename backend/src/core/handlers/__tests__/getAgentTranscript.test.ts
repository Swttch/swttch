import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/loadWorkflowAgentTranscript', () => ({
  loadWorkflowAgentTranscript: vi.fn(),
}));

import { getAgentTranscriptHandler } from '../getAgentTranscript';
import { loadWorkflowAgentTranscript } from '../../features/loadWorkflowAgentTranscript';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}

describe('getAgentTranscriptHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acks with entries and truncated on success', async () => {
    vi.mocked(loadWorkflowAgentTranscript).mockResolvedValue({
      entries: [{ type: 'user', uuid: 'u1' }],
      truncated: false,
      startIndex: 0,
    });
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.GET_AGENT_TRANSCRIPT,
      payload: { transcriptDir: '/x/y', agentId: 'a1' },
      timestamp: 0,
      requestId: 'req-1',
    };

    await getAgentTranscriptHandler('conn-1', message, connections, {} as Bridge);

    expect(loadWorkflowAgentTranscript).toHaveBeenCalledWith({ transcriptDir: '/x/y', agentId: 'a1', pages: 1 });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      entries: [{ type: 'user', uuid: 'u1' }],
      truncated: false,
      startIndex: 0,
    });
  });

  it('passes the number of pages asked for, and 1 for anything that is not a number', async () => {
    vi.mocked(loadWorkflowAgentTranscript).mockResolvedValue({ entries: [], truncated: false, startIndex: 0 });
    const connections = createMockConnections();
    const ask = (pages: unknown) =>
      getAgentTranscriptHandler(
        'conn-1',
        { type: MessageType.GET_AGENT_TRANSCRIPT, payload: { transcriptDir: '/x', agentId: 'a', pages }, timestamp: 0, requestId: 'r' },
        connections,
        {} as Bridge,
      );

    await ask(3);
    expect(loadWorkflowAgentTranscript).toHaveBeenLastCalledWith({ transcriptDir: '/x', agentId: 'a', pages: 3 });
    await ask('3');
    expect(loadWorkflowAgentTranscript).toHaveBeenLastCalledWith({ transcriptDir: '/x', agentId: 'a', pages: 1 });
  });

  it('acks with status error when the loader throws', async () => {
    vi.mocked(loadWorkflowAgentTranscript).mockRejectedValue(new Error('boom'));
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.GET_AGENT_TRANSCRIPT,
      payload: { transcriptDir: '/x/y', agentId: 'a1' },
      timestamp: 0,
      requestId: 'req-2',
    };

    await getAgentTranscriptHandler('conn-1', message, connections, {} as Bridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-2',
      status: 'error',
      error: 'boom',
    });
  });

  it('defaults missing transcriptDir/agentId payload fields to empty strings', async () => {
    vi.mocked(loadWorkflowAgentTranscript).mockResolvedValue({ entries: [], truncated: false, startIndex: 0 });
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.GET_AGENT_TRANSCRIPT,
      payload: {},
      timestamp: 0,
      requestId: 'req-3',
    };

    await getAgentTranscriptHandler('conn-1', message, connections, {} as Bridge);

    expect(loadWorkflowAgentTranscript).toHaveBeenCalledWith({ transcriptDir: '', agentId: '', pages: 1 });
  });
});
