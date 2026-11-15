import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  unlink: vi.fn(),
}));

vi.mock('../../features/getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

vi.mock('../../features/sessionTitleOverrides', () => ({
  removeSessionTitleOverride: vi.fn(),
}));

import { unlink } from 'fs/promises';
import { deleteSessionHandler } from '../deleteSession';
import { getProjectSessionsPath } from '../../features/getProjectSessionsPath';
import { removeSessionTitleOverride } from '../../features/sessionTitleOverrides';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockUnlink = vi.mocked(unlink);
const mockGetPath = vi.mocked(getProjectSessionsPath);
const mockRemoveOverride = vi.mocked(removeSessionTitleOverride);

function createMockConnections() {
  return {
    sendTo: vi.fn(),
    broadcastToAll: vi.fn(),
  } as unknown as ConnectionManager;
}

const mockBridge = {} as Bridge;

describe('deleteSessionHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPath.mockResolvedValue('/home/user/.claude/projects/-test');
  });

  it('should return error when sessionId is missing', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.DELETE_SESSION, payload: {}, timestamp: 0, requestId: 'req-1' };

    await deleteSessionHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
      error: 'Missing sessionId',
    }));
  });

  it('should reject path traversal with .. in sessionId', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.DELETE_SESSION,
      payload: { sessionId: '../../../etc/passwd', workingDir: '/test' },
      timestamp: 0,
      requestId: 'req-1',
    };

    await deleteSessionHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
      error: 'Invalid sessionId',
    }));
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('should reject sessionId with path separator', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.DELETE_SESSION,
      payload: { sessionId: 'subdir/file', workingDir: '/test' },
      timestamp: 0,
      requestId: 'req-1',
    };

    await deleteSessionHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
      error: 'Invalid sessionId',
    }));
  });

  it('should return error when workingDir is missing', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.DELETE_SESSION,
      payload: { sessionId: 'valid-session-id' },
      timestamp: 0,
      requestId: 'req-1',
    };

    await deleteSessionHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
      error: 'workingDir is required',
    }));
  });

  it('should delete valid session and broadcast update', async () => {
    const connections = createMockConnections();
    mockUnlink.mockResolvedValue(undefined);
    const message: IPCMessage = {
      type: MessageType.DELETE_SESSION,
      payload: { sessionId: 'abc123', workingDir: '/test' },
      timestamp: 0,
      requestId: 'req-1',
    };

    await deleteSessionHandler('conn-1', message, connections, mockBridge);

    expect(mockUnlink).toHaveBeenCalled();
    expect(mockRemoveOverride).toHaveBeenCalledWith('/home/user/.claude/projects/-test', 'abc123');
    expect(connections.broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, {
      action: 'delete',
      session: { sessionId: 'abc123' }, ts: expect.any(Number),
    }, undefined);
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'ok',
    }));
  });

  it('should return error when file deletion fails', async () => {
    const connections = createMockConnections();
    mockUnlink.mockRejectedValue(new Error('ENOENT'));
    const message: IPCMessage = {
      type: MessageType.DELETE_SESSION,
      payload: { sessionId: 'abc123', workingDir: '/test' },
      timestamp: 0,
      requestId: 'req-1',
    };

    await deleteSessionHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      status: 'error',
      error: 'ENOENT',
    }));
  });
});
