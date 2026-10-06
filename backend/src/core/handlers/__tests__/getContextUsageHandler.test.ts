import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../claude', () => ({
  Claude: { exec: vi.fn() },
}));

import { Claude } from '../../claude';
import { buildContextUsageArgs, getContextUsageHandler } from '../getContextUsageHandler';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockExec = vi.mocked(Claude.exec);

const SESSION_ID = 'c030e1f5-2098-478d-a553-64a523e5f16e';

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.GET_CONTEXT_USAGE, requestId: 'r1', payload } as unknown as IPCMessage;
}

describe('buildContextUsageArgs', () => {
  it('resumes the session without persisting anything, so the history stays untouched', () => {
    expect(buildContextUsageArgs(SESSION_ID)).toEqual([
      '-p',
      '--resume',
      SESSION_ID,
      '--no-session-persistence',
      '/context',
    ]);
  });
});

describe('getContextUsageHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the CLI report untouched and runs it in the session workspace with stdin closed', async () => {
    mockExec.mockResolvedValue({ stdout: '## Context Usage\n**Tokens:** 43.3k / 1m (4%)\n', stderr: '' });
    const connections = createMockConnections();

    await getContextUsageHandler('c1', message({ sessionId: SESSION_ID, workingDir: '/work' }), connections, {} as Bridge);

    expect(mockExec).toHaveBeenCalledWith(
      buildContextUsageArgs(SESSION_ID),
      expect.objectContaining({ cwd: '/work', closeStdin: true }),
    );
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, {
      requestId: 'r1',
      status: 'ok',
      markdown: '## Context Usage\n**Tokens:** 43.3k / 1m (4%)\n',
    });
  });

  it('refuses anything that is not a session id before it can reach a command line', async () => {
    const connections = createMockConnections();

    await getContextUsageHandler('c1', message({ sessionId: 'x; rm -rf ~', workingDir: '/work' }), connections, {} as Bridge);

    expect(mockExec).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith(
      'c1',
      MessageType.ACK,
      expect.objectContaining({ requestId: 'r1', status: 'error' }),
    );
  });

  it('reports a failed run as an error instead of throwing', async () => {
    mockExec.mockRejectedValue(new Error('boom'));
    const connections = createMockConnections();

    await getContextUsageHandler('c1', message({ sessionId: SESSION_ID }), connections, {} as Bridge);

    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, {
      requestId: 'r1',
      status: 'error',
      error: 'boom',
    });
  });
});
