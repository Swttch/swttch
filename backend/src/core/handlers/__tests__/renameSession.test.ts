import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../features/getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

vi.mock('../../features/sessionTitleOverrides', () => ({
  removeSessionTitleOverride: vi.fn(),
}));

vi.mock('../../features/cli-rename', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/cli-rename')>()),
  renameSessionThroughCli: vi.fn(),
}));

import { existsSync } from 'fs';
import { renameSessionHandler } from '../renameSession';
import { getProjectSessionsPath } from '../../features/getProjectSessionsPath';
import { removeSessionTitleOverride } from '../../features/sessionTitleOverrides';
import { renameSessionThroughCli } from '../../features/cli-rename';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockExistsSync = vi.mocked(existsSync);
const mockGetPath = vi.mocked(getProjectSessionsPath);
const mockRemoveOverride = vi.mocked(removeSessionTitleOverride);
const mockRenameThroughCli = vi.mocked(renameSessionThroughCli);

function createMockConnections() {
  return {
    sendTo: vi.fn(),
    broadcastToAll: vi.fn(),
  } as unknown as ConnectionManager;
}

const mockBridge = {} as Bridge;

function renameMessage(payload: Record<string, unknown>): IPCMessage {
  return {
    type: MessageType.RENAME_SESSION,
    payload,
    timestamp: 0,
    requestId: 'req-1',
  };
}

describe('renameSessionHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPath.mockResolvedValue('/home/user/.claude/projects/-test');
    mockExistsSync.mockReturnValue(true);
  });

  it('returns an error when sessionId is missing', async () => {
    const connections = createMockConnections();

    await renameSessionHandler('conn-1', renameMessage({ title: 'New', workingDir: '/test' }), connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
    }));
    expect(mockRenameThroughCli).not.toHaveBeenCalled();
    expect(mockRemoveOverride).not.toHaveBeenCalled();
  });

  it('returns an error when title is missing or blank', async () => {
    const connections = createMockConnections();

    await renameSessionHandler(
      'conn-1',
      renameMessage({ sessionId: 'abc123', title: '   ', workingDir: '/test' }),
      connections,
      mockBridge,
    );

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
    }));
    expect(mockRenameThroughCli).not.toHaveBeenCalled();
    expect(mockRemoveOverride).not.toHaveBeenCalled();
  });

  it('returns an error when workingDir is missing', async () => {
    const connections = createMockConnections();

    await renameSessionHandler(
      'conn-1',
      renameMessage({ sessionId: 'abc123', title: 'New' }),
      connections,
      mockBridge,
    );

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
    }));
    expect(mockRenameThroughCli).not.toHaveBeenCalled();
    expect(mockRemoveOverride).not.toHaveBeenCalled();
  });

  it('rejects path traversal with .. in sessionId', async () => {
    const connections = createMockConnections();

    await renameSessionHandler(
      'conn-1',
      renameMessage({ sessionId: '../../../etc/passwd', title: 'New', workingDir: '/test' }),
      connections,
      mockBridge,
    );

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
      error: 'Invalid sessionId',
    }));
    expect(mockRenameThroughCli).not.toHaveBeenCalled();
    expect(mockRemoveOverride).not.toHaveBeenCalled();
  });

  it('rejects sessionId with a path separator', async () => {
    const connections = createMockConnections();

    await renameSessionHandler(
      'conn-1',
      renameMessage({ sessionId: 'subdir/file', title: 'New', workingDir: '/test' }),
      connections,
      mockBridge,
    );

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
      error: 'Invalid sessionId',
    }));
    expect(mockRenameThroughCli).not.toHaveBeenCalled();
    expect(mockRemoveOverride).not.toHaveBeenCalled();
  });

  it('returns an error when the session file does not exist', async () => {
    const connections = createMockConnections();
    mockExistsSync.mockReturnValue(false);

    await renameSessionHandler(
      'conn-1',
      renameMessage({ sessionId: 'abc123', title: 'New', workingDir: '/test' }),
      connections,
      mockBridge,
    );

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
      error: 'Session not found',
    }));
    expect(mockRenameThroughCli).not.toHaveBeenCalled();
    expect(mockRemoveOverride).not.toHaveBeenCalled();
  });

  it('renames through the CLI, drops the legacy override, broadcasts, and acks ok for a valid request', async () => {
    const connections = createMockConnections();
    mockRenameThroughCli.mockResolvedValue('request_to_resumed_cli');
    mockRemoveOverride.mockResolvedValue(undefined);

    await renameSessionHandler(
      'conn-1',
      renameMessage({ sessionId: 'abc123', title: '  My Renamed Session  ', workingDir: '/test' }),
      connections,
      mockBridge,
    );

    expect(mockRenameThroughCli).toHaveBeenCalledWith(connections, 'abc123', 'My Renamed Session', '/test');
    expect(mockRemoveOverride).toHaveBeenCalledWith('/home/user/.claude/projects/-test', 'abc123');
    expect(connections.broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, {
      action: 'rename',
      session: { sessionId: 'abc123', title: 'My Renamed Session' },
    });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'ok',
    }));
  });

  it('broadcasts the name as the CLI will keep it: one line', async () => {
    const connections = createMockConnections();
    mockRenameThroughCli.mockResolvedValue('request_to_live_cli');

    await renameSessionHandler(
      'conn-1',
      renameMessage({ sessionId: 'abc123', title: 'two\nlines', workingDir: '/test' }),
      connections,
      mockBridge,
    );

    expect(connections.broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, {
      action: 'rename',
      session: { sessionId: 'abc123', title: 'two lines' },
    });
  });

  it('returns an error, and leaves any legacy override alone, when the CLI does not rename', async () => {
    const connections = createMockConnections();
    mockRenameThroughCli.mockRejectedValue(new Error('claude /rename timed out'));

    await renameSessionHandler(
      'conn-1',
      renameMessage({ sessionId: 'abc123', title: 'New', workingDir: '/test' }),
      connections,
      mockBridge,
    );

    expect(mockRemoveOverride).not.toHaveBeenCalled();
    expect(connections.broadcastToAll).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
      error: 'claude /rename timed out',
    }));
  });
});
