import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChildProcess } from 'node:child_process';
import { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import { MessageType, type AccountPoolRecovery } from '../../../shared';
import { prepareAccountPoolRecoveryHandler } from '../prepareAccountPoolRecovery';
import { readRegistry } from '../../features/account-store';
import { selectAccountPoolAccount } from '../../features/account-pool-usage';
import { switchToAccount } from '../../features/account-manager';
import { accountPoolSelectionRevision, accountPoolRecoveryRevision } from '../../features/account-pool-recovery-store';
import { restartClaudeSessionProcess } from '../../claude-process';

const state = vi.hoisted(() => ({ recovery: null as AccountPoolRecovery | null }));
vi.mock('../../features/account-store', () => ({ readRegistry: vi.fn() }));
vi.mock('../../features/account-pool-usage', () => ({ selectAccountPoolAccount: vi.fn() }));
vi.mock('../../features/account-manager', () => ({ switchToAccount: vi.fn() }));
vi.mock('../../features/account-pool-recovery-store', () => ({
  accountPoolSelectionRevision: vi.fn(() => 0),
  accountPoolRecoveryRevision: vi.fn(() => 0),
  readAccountPoolRecovery: vi.fn(async () => state.recovery),
  writeAccountPoolRecovery: vi.fn(async (_session: string, recovery: AccountPoolRecovery) => { state.recovery = recovery; return true; }),
}));
vi.mock('../../claude-process', () => ({ restartClaudeSessionProcess: vi.fn() }));
vi.mock('../getUsage', () => ({ resetUsageCache: vi.fn() }));
vi.mock('../getAllUsage', () => ({ resetAllUsageCache: vi.fn() }));

const bridge = {} as Bridge;
const connections = new ConnectionManager(true);
const process = new ChildProcess();
const ack = vi.spyOn(connections, 'sendTo').mockImplementation(() => {});
vi.spyOn(connections, 'broadcastToAll').mockImplementation(() => {});
vi.spyOn(connections, 'getProcess').mockReturnValue(process);
function prepare(sourceMessageUuid = 'personal-limit') {
  return prepareAccountPoolRecoveryHandler('tab-a', { type: MessageType.PREPARE_ACCOUNT_POOL_RECOVERY,
    requestId: 'r', timestamp: 0, payload: { sessionId: 'session', sourceMessageUuid, model: 'opus' } }, connections, bridge);
}
beforeEach(() => {
  vi.clearAllMocks(); state.recovery = null;
  vi.mocked(accountPoolRecoveryRevision).mockReturnValue(0);
  vi.mocked(accountPoolSelectionRevision).mockReturnValue(0);
  vi.mocked(readRegistry).mockResolvedValue({ current: 'personal', accounts: {}, accountOrder: [], accountPools: [] });
  vi.mocked(selectAccountPoolAccount).mockResolvedValue({ accountId: 'company', resetsAt: '2026-09-08T01:00:00Z' });
});
describe('foreground account pool recovery', () => {
  it('checks usage before switching and restarting, then grants one continuation', async () => {
    await prepare();
    expect(vi.mocked(selectAccountPoolAccount).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(switchToAccount).mock.invocationCallOrder[0]);
    expect(switchToAccount).toHaveBeenCalledWith('company', expect.any(Function));
    expect(restartClaudeSessionProcess).toHaveBeenCalledWith(connections, 'session', process);
    expect(ack).toHaveBeenLastCalledWith('tab-a', MessageType.ACK, expect.objectContaining({ continueInSession: true }));
    expect(state.recovery).toMatchObject({ accountId: 'company', awaitingLimit: true });
  });
  it('does not rescan or switch when the foreground returns the selected account limit', async () => {
    await prepare();
    await prepare('company-limit');
    expect(selectAccountPoolAccount).toHaveBeenCalledTimes(1);
    expect(switchToAccount).toHaveBeenCalledTimes(1);
    expect(state.recovery?.awaitingLimit).toBe(false);
    expect(ack).toHaveBeenLastCalledWith('tab-a', MessageType.ACK, expect.objectContaining({ continueInSession: false }));
  });
  it('shares preparation and lets a reconnect claim the continuation', async () => {
    await Promise.all([prepare(), prepare()]);
    expect(switchToAccount).toHaveBeenCalledTimes(1);
    expect(ack.mock.calls.filter(([, , payload]) => payload?.continueInSession)).toHaveLength(2);
  });
  it('does not switch after a normal user turn invalidates an in-progress lookup', async () => {
    vi.mocked(accountPoolRecoveryRevision).mockReturnValueOnce(0).mockReturnValue(1);
    await prepare();
    expect(switchToAccount).not.toHaveBeenCalled();
    expect(state.recovery).toBeNull();
  });
  it('does not override manual account selection made during usage lookup', async () => {
    vi.mocked(selectAccountPoolAccount).mockImplementation(async () => {
      vi.mocked(accountPoolSelectionRevision).mockReturnValue(1);
      return { accountId: 'company', resetsAt: '2026-09-08T01:00:00Z' };
    });
    await prepare();
    expect(switchToAccount).not.toHaveBeenCalled();
    expect(ack).toHaveBeenLastCalledWith('tab-a', MessageType.ACK, expect.objectContaining({ canceled: true, continueInSession: false }));
  });
  it('retains the current account when its reset is earliest', async () => {
    vi.mocked(selectAccountPoolAccount).mockResolvedValue({ accountId: 'personal', resetsAt: '2026-09-08T01:00:00Z' });
    await prepare();
    expect(switchToAccount).not.toHaveBeenCalled();
    expect(restartClaudeSessionProcess).not.toHaveBeenCalled();
    expect(state.recovery).toMatchObject({ accountId: 'personal', awaitingLimit: false });
  });
  it('binds fallback to the original account if usage cannot be established', async () => {
    vi.mocked(selectAccountPoolAccount).mockResolvedValue(null);
    await prepare();
    expect(switchToAccount).not.toHaveBeenCalled();
    expect(state.recovery).toMatchObject({ accountId: 'personal', resetsAt: null, awaitingLimit: false });
  });
  it('does not send a second reminder after reload once the first was claimed', async () => {
    state.recovery = { sourceMessageUuid: 'personal-limit', accountId: 'company', resetsAt: null,
      awaitingLimit: true, continuationSent: true };
    await prepare();
    expect(selectAccountPoolAccount).not.toHaveBeenCalled();
    expect(ack).toHaveBeenLastCalledWith('tab-a', MessageType.ACK, expect.objectContaining({ continueInSession: false }));
  });
  it('allows a reload to recover a prepared reminder that was never sent', async () => {
    state.recovery = { sourceMessageUuid: 'personal-limit', accountId: 'company', resetsAt: null, awaitingLimit: true };
    await prepare();
    expect(switchToAccount).not.toHaveBeenCalled();
    expect(ack).toHaveBeenLastCalledWith('tab-a', MessageType.ACK, expect.objectContaining({ continueInSession: true }));
  });
});
