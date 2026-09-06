import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../features/account-switch-preflight', () => ({
  verifyAccountSwitch: vi.fn(),
}));
vi.mock('../../claude-process', () => ({
  restartClaudeSessionProcess: vi.fn(),
}));

import { verifyAccountSwitchHandler } from '../verifyAccountSwitch';
import { verifyAccountSwitch } from '../../features/account-switch-preflight';
import { restartClaudeSessionProcess } from '../../claude-process';
import {
  AccountSwitchPreflightOutcome,
  MessageType,
} from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

const bridge = {} as Bridge;
const process = { pid: 42 };

function createConnections() {
  return {
    getProcess: vi.fn(() => process),
    sendTo: vi.fn(),
  } as unknown as ConnectionManager;
}

function message(): IPCMessage {
  return {
    type: MessageType.VERIFY_ACCOUNT_SWITCH,
    requestId: 'req-1',
    timestamp: 0,
    payload: { workingDir: '/project', sessionId: 'session-1' },
  };
}

describe('verifyAccountSwitchHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restarts the existing session process before acknowledging a successful preflight', async () => {
    vi.mocked(verifyAccountSwitch).mockResolvedValue({
      outcome: AccountSwitchPreflightOutcome.SUCCESS,
    });
    const connections = createConnections();

    await verifyAccountSwitchHandler('conn-1', message(), connections, bridge);

    expect(restartClaudeSessionProcess).toHaveBeenCalledWith(connections, 'session-1', process);
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      outcome: AccountSwitchPreflightOutcome.SUCCESS,
    });
  });

  it('keeps the existing session process when preflight times out', async () => {
    vi.mocked(verifyAccountSwitch).mockResolvedValue({
      outcome: AccountSwitchPreflightOutcome.TIMEOUT,
    });
    const connections = createConnections();

    await verifyAccountSwitchHandler('conn-1', message(), connections, bridge);

    expect(restartClaudeSessionProcess).not.toHaveBeenCalled();
  });
});
