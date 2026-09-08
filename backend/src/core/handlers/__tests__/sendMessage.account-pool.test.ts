import { beforeEach, expect, it, vi } from 'vitest';
import { ChildProcess } from 'node:child_process';
import { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import { ACCOUNT_POOL_CONTINUE_REMINDER, MessageType } from '../../../shared';
import { sendMessageHandler } from '../sendMessage';
import { withAccount } from '../../features/account-manager';
import { ensureClaudeProcess, restartClaudeSessionProcess, sendMessageToProcess } from '../../claude-process';
import { claimAccountPoolContinuation, clearAccountPoolRecovery } from '../../features/account-pool-recovery-store';
vi.mock('../../features/account-manager', () => ({ withAccount: vi.fn(async (_id: string, action: () => Promise<void>) => action()) }));
vi.mock('../../claude-process', () => ({ ensureClaudeProcess: vi.fn(), restartClaudeSessionProcess: vi.fn(), sendMessageToProcess: vi.fn() }));
vi.mock('../../features/account-pool-recovery-store', () => ({ claimAccountPoolContinuation: vi.fn(async () => true), clearAccountPoolRecovery: vi.fn() }));
vi.mock('../../features/telemetry', () => ({ trackEvent: vi.fn() }));
vi.mock('../../features/fable-probe', () => ({ invalidateFableProbeCache: vi.fn() }));
vi.mock('../getUsage', () => ({ resetUsageCache: vi.fn() }));
vi.mock('../getAllUsage', () => ({ resetAllUsageCache: vi.fn() }));
const connections = new ConnectionManager(true);
const proc = new ChildProcess();
vi.spyOn(connections, 'getProcess').mockReturnValue(proc);
vi.spyOn(connections, 'subscribe').mockImplementation(() => {});
vi.spyOn(connections, 'sendTo').mockImplementation(() => {});
vi.spyOn(connections, 'broadcastToAll').mockImplementation(() => {});
vi.spyOn(connections, 'broadcastToSession').mockImplementation(() => {});
const bridge = {} as Bridge;
function send(content: string, accountId?: string) {
  return sendMessageHandler('tab', { type: MessageType.SEND_MESSAGE, requestId: 'r', timestamp: 0,
    payload: { sessionId: 'session', workingDir: '/fixture', content, accountId } }, connections, bridge);
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(claimAccountPoolContinuation).mockResolvedValue(true); });
it('pins the account while restarting and sending the reserved continuation', async () => {
  await send('continue', 'company');
  expect(withAccount).toHaveBeenCalledWith('company', expect.any(Function));
  expect(restartClaudeSessionProcess).toHaveBeenCalledWith(connections, 'session', proc);
  expect(vi.mocked(restartClaudeSessionProcess).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(ensureClaudeProcess).mock.invocationCallOrder[0]);
  expect(vi.mocked(ensureClaudeProcess).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(sendMessageToProcess).mock.invocationCallOrder[0]);
});
it('recognizes a hidden recovery reminder even with injected editor context', async () => {
  await send('<ide_selection>fixture</ide_selection>\n' + ACCOUNT_POOL_CONTINUE_REMINDER, 'company');
  expect(claimAccountPoolContinuation).toHaveBeenCalledWith('session');
  expect(clearAccountPoolRecovery).not.toHaveBeenCalled();
});
it('does not send a reminder claimed by another tab', async () => {
  vi.mocked(claimAccountPoolContinuation).mockResolvedValue(false);
  await send(ACCOUNT_POOL_CONTINUE_REMINDER, 'company');
  expect(withAccount).not.toHaveBeenCalled();
  expect(ensureClaudeProcess).not.toHaveBeenCalled();
  expect(sendMessageToProcess).not.toHaveBeenCalled();
});
it('clears recovery for a normal user turn without changing accounts', async () => {
  await send('another request');
  expect(clearAccountPoolRecovery).toHaveBeenCalledWith('session');
  expect(withAccount).not.toHaveBeenCalled();
  expect(restartClaudeSessionProcess).not.toHaveBeenCalled();
});
