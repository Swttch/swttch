import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BEFORE import
vi.mock('../../claude', () => ({
  Claude: {
    execAuthed: vi.fn(),
    // Called unconditionally now: skipping when no workingDir is given would leave whichever
    // project last wrote one, and this handler would report that project's account.
    applyConfigDir: vi.fn().mockResolvedValue(undefined),
  },
}));

import { getAccountHandler } from '../getAccount';
import { Claude } from '../../claude';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockExec = vi.mocked(Claude.execAuthed);

function createMockConnections() {
  return {
    sendTo: vi.fn(),
    broadcastToAll: vi.fn(),
  } as unknown as ConnectionManager;
}

const mockBridge = {} as Bridge;

const validAccountPayload = {
  loggedIn: true,
  authMethod: 'claude.ai',
  email: 'user@example.com',
  subscriptionType: 'Pro',
  orgId: 'org-123',
  orgName: 'My Org',
};

describe('getAccountHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send ACK with status ok and parsed account on success', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_ACCOUNT, payload: {}, timestamp: 0, requestId: 'req-1' };

    mockExec.mockResolvedValue({
      stdout: JSON.stringify(validAccountPayload),
      stderr: '',
    });

    await getAccountHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      requestId: 'req-1',
      status: 'ok',
      account: validAccountPayload,
    }));
  });

  it('should resolve a definitive logged-out state (status ok, loggedIn false) when the CLI prints valid JSON', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_ACCOUNT, payload: {}, timestamp: 0, requestId: 'req-1' };

    // Logged-in account resolves cleanly with loggedIn:false — the CLI is authoritative.
    mockExec.mockResolvedValue({
      stdout: JSON.stringify({ loggedIn: false, authMethod: 'none' }),
      stderr: '',
    });

    await getAccountHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      requestId: 'req-1',
      status: 'ok',
      account: { loggedIn: false, authMethod: 'none' },
    }));
  });

  it('should recover a logged-out state from a non-zero exit that still carries JSON stdout', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_ACCOUNT, payload: {}, timestamp: 0, requestId: 'req-1' };

    // Real CLI behaviour: `auth status` on a logged-out account exits 1 but prints
    // `{"loggedIn":false}`. runExecFile attaches that stdout to the rejected error.
    const err = Object.assign(new Error('Command failed'), {
      code: 1,
      stdout: JSON.stringify({ loggedIn: false, authMethod: 'none' }),
      stderr: '',
    });
    mockExec.mockRejectedValue(err);

    await getAccountHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      requestId: 'req-1',
      status: 'ok',
      account: { loggedIn: false, authMethod: 'none' },
    }));
  });

  it('should send ACK with status error (undetermined) when the CLI prints no parseable output', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_ACCOUNT, payload: {}, timestamp: 0, requestId: 'req-1' };

    mockExec.mockResolvedValue({
      stdout: '',
      stderr: '',
    });

    await getAccountHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      requestId: 'req-1',
      status: 'error',
      error: 'Could not determine Claude Code login status (auth status check failed).',
    }));
  });

  it('should send ACK with status error (undetermined) when execAuthed fails with no stdout (timeout/spawn error)', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_ACCOUNT, payload: {}, timestamp: 0, requestId: 'req-1' };

    // Timeout / spawn error: rejected with no parseable stdout → undetermined, NOT a logout.
    mockExec.mockRejectedValue(new Error('spawn error'));

    await getAccountHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      requestId: 'req-1',
      status: 'error',
      error: 'Could not determine Claude Code login status (auth status check failed).',
    }));
  });

  it('should call Claude.execAuthed with auth status args, workingDir, and timeout 8000', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_ACCOUNT, payload: {}, timestamp: 0, requestId: 'req-1' };

    mockExec.mockResolvedValue({
      stdout: JSON.stringify(validAccountPayload),
      stderr: '',
    });

    await getAccountHandler('conn-1', message, connections, mockBridge);

    // execAuthed(args, workingDir, options) — no workingDir in this payload → undefined.
    expect(mockExec).toHaveBeenCalledWith(['auth', 'status'], undefined, { timeout: 8000 });
  });
});
