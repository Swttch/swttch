import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../claude', () => ({
  Claude: { execAuthed: vi.fn() },
}));

vi.mock('../../features/claude-settings', () => ({
  readMergedClaudeSettings: vi.fn(),
}));

import { rewindCodeHandler } from '../rewindCode';
import { Claude } from '../../claude';
import { readMergedClaudeSettings } from '../../features/claude-settings';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockExec = vi.mocked(Claude.execAuthed);
const mockSettings = vi.mocked(readMergedClaudeSettings);

function createMockConnections() {
  return { sendTo: vi.fn(), broadcastToAll: vi.fn() } as unknown as ConnectionManager;
}

const mockBridge = {} as Bridge;

const SESSION = '7441ab88-2357-4f3c-ac75-79311f5de175';
const SEND = '65653f1e-09ff-4570-a371-ea968d39c2d0';

function request(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.REWIND_CODE, payload, timestamp: 0, requestId: 'req-1' };
}

function ackOf(connections: ConnectionManager) {
  return vi.mocked(connections.sendTo).mock.calls[0][2] as Record<string, unknown>;
}

describe('rewindCodeHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings.mockResolvedValue({ settings: {}, overrides: [] });
    mockExec.mockResolvedValue({ stdout: `Files rewound to state at message ${SEND}\n`, stderr: '' });
  });

  it('runs the CLI rewind for the given session and send', async () => {
    const connections = createMockConnections();

    await rewindCodeHandler('c1', request({ sessionId: SESSION, sendUuid: SEND, workingDir: '/repo' }), connections, mockBridge);

    expect(mockExec).toHaveBeenCalledWith(
      ['--resume', SESSION, '--rewind-files', SEND],
      '/repo',
      expect.objectContaining({ cwd: '/repo' }),
    );
    expect(ackOf(connections)).toMatchObject({ status: 'ok' });
  });

  // Without this the CLI answers "File rewinding is not enabled." and exits 1,
  // so the env is part of the command, not an optimisation.
  it('carries file checkpointing in the env', async () => {
    const connections = createMockConnections();

    await rewindCodeHandler('c1', request({ sessionId: SESSION, sendUuid: SEND, workingDir: '/repo' }), connections, mockBridge);

    expect(mockExec.mock.calls[0][2]?.env).toMatchObject({
      CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: 'true',
    });
  });

  // A user who turned Claude's own setting off gets told the feature is off,
  // rather than a rewind that reports success while restoring nothing.
  it('omits the env when the user turned checkpointing off', async () => {
    mockSettings.mockResolvedValue({ settings: { fileCheckpointingEnabled: false }, overrides: [] });
    const connections = createMockConnections();

    await rewindCodeHandler('c1', request({ sessionId: SESSION, sendUuid: SEND, workingDir: '/repo' }), connections, mockBridge);

    expect(mockExec.mock.calls[0][2]?.env).toEqual({});
  });

  it('relays the CLI line verbatim on success', async () => {
    const connections = createMockConnections();

    await rewindCodeHandler('c1', request({ sessionId: SESSION, sendUuid: SEND, workingDir: '/repo' }), connections, mockBridge);

    expect(ackOf(connections)).toMatchObject({
      status: 'ok',
      message: `Files rewound to state at message ${SEND}`,
    });
  });

  it('relays the CLI stderr when the rewind is refused', async () => {
    mockExec.mockRejectedValue(
      Object.assign(new Error('exit 1'), { stderr: 'Error: File rewinding is not enabled.\n' }),
    );
    const connections = createMockConnections();

    await rewindCodeHandler('c1', request({ sessionId: SESSION, sendUuid: SEND, workingDir: '/repo' }), connections, mockBridge);

    expect(ackOf(connections)).toMatchObject({
      status: 'error',
      error: 'Error: File rewinding is not enabled.',
    });
  });

  it.each([
    ['sessionId', { sendUuid: SEND, workingDir: '/repo' }, 'Missing sessionId'],
    ['sendUuid', { sessionId: SESSION, workingDir: '/repo' }, 'Missing sendUuid'],
    ['workingDir', { sessionId: SESSION, sendUuid: SEND }, 'workingDir is required'],
  ])('refuses a request with no %s', async (_name, payload, expected) => {
    const connections = createMockConnections();

    await rewindCodeHandler('c1', request(payload), connections, mockBridge);

    expect(ackOf(connections)).toMatchObject({ status: 'error', error: expected });
    expect(mockExec).not.toHaveBeenCalled();
  });

  // Both ids are interpolated into an argv, so a value that is not a plain uuid
  // never reaches the CLI.
  it.each([
    ['../../etc/passwd', SEND, 'Invalid sessionId'],
    [SESSION, 'a/b', 'Invalid sendUuid'],
  ])('refuses a path-like id (%s)', async (sessionId, sendUuid, expected) => {
    const connections = createMockConnections();

    await rewindCodeHandler('c1', request({ sessionId, sendUuid, workingDir: '/repo' }), connections, mockBridge);

    expect(ackOf(connections)).toMatchObject({ status: 'error', error: expected });
    expect(mockExec).not.toHaveBeenCalled();
  });
});
