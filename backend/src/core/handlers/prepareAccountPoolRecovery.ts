import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType, type AccountPoolRecoveryResult } from '../../shared';
import { readRegistry } from '../features/account-store';
import { selectAccountPoolAccount, fetchAccountUsage, accountResetsAt } from '../features/account-pool-usage';
import { switchToAccount } from '../features/account-manager';
import { readAccountPoolRecovery, writeAccountPoolRecovery, accountPoolRecoveryRevision, accountPoolSelectionRevision } from '../features/account-pool-recovery-store';
import { restartClaudeSessionProcess } from '../claude-process';
import { resetUsageCache } from './getUsage';
import { resetAllUsageCache } from './getAllUsage';

const preparing = new Map<string, Promise<AccountPoolRecoveryResult>>();
export async function prepareAccountPoolRecoveryHandler(
  connectionId: string, message: IPCMessage, connections: ConnectionManager, _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as { sessionId?: string; sourceMessageUuid?: string; model?: string };
  if (!payload?.sessionId || !payload.sourceMessageUuid) throw new Error('sessionId and sourceMessageUuid are required');
  const { sessionId, sourceMessageUuid, model } = payload;
  const pending = preparing.get(sessionId);
  let result: AccountPoolRecoveryResult;
  if (pending) {
    // A reconnect may replace the tab that started the lookup. Every waiting
    // tab may submit; claimAccountPoolContinuation admits exactly one stdin write.
    result = await pending;
  } else {
    const task = (async (): Promise<AccountPoolRecoveryResult> => {
      const revision = accountPoolRecoveryRevision(sessionId);
      const selectionRevision = accountPoolSelectionRevision();
      const canceled = () => accountPoolRecoveryRevision(sessionId) !== revision || accountPoolSelectionRevision() !== selectionRevision;
      const canceledResult: AccountPoolRecoveryResult = { recovery: null, continueInSession: false, canceled: true };
      const existing = await readAccountPoolRecovery(sessionId);
      if (canceled()) return canceledResult;
      if (existing) {
        if (existing.sourceMessageUuid !== sourceMessageUuid && existing.awaitingLimit) {
          existing.awaitingLimit = false;
          await writeAccountPoolRecovery(sessionId, existing, revision);
        }
        if (canceled()) return canceledResult;
        return { recovery: existing, continueInSession: existing.awaitingLimit && !existing.continuationSent };
      }
      const registry = await readRegistry();
      let usageLookupFailed = false;
      let currentResetsAt: string | null = null;
      const selected = await selectAccountPoolAccount(registry, model, async accountId => {
        try {
          const usage = await fetchAccountUsage(accountId);
          const resetsAt = accountResetsAt(usage, model);
          if (resetsAt === null) usageLookupFailed = true;
          if (accountId === registry.current) currentResetsAt = resetsAt || null;
          return usage;
        }
        catch (error) { usageLookupFailed = true; throw error; }
      });
      if (canceled()) return canceledResult;
      if (!selected) {
        if (!registry.current) return { recovery: null, continueInSession: false };
        const recovery = { sourceMessageUuid, accountId: registry.current, resetsAt: currentResetsAt, awaitingLimit: false, ...(usageLookupFailed ? { usageLookupFailed: true } : {}) };
        if (!(await writeAccountPoolRecovery(sessionId, recovery, revision)) || canceled()) return canceledResult;
        return { recovery, continueInSession: false };
      }
      const switched = selected.accountId !== registry.current;
      if (switched) {
        try { await switchToAccount(selected.accountId, () => !canceled()); }
        catch (error) { if (canceled()) return canceledResult; throw error; }
        if (canceled()) return canceledResult;
        resetUsageCache();
        resetAllUsageCache();
        connections.broadcastToAll(MessageType.ACCOUNTS_CHANGED, {});
        const proc = connections.getProcess(sessionId);
        if (proc) await restartClaudeSessionProcess(connections, sessionId, proc);
      }
      if (canceled()) return canceledResult;
      const recovery = { ...selected, sourceMessageUuid, awaitingLimit: switched };
      if (!(await writeAccountPoolRecovery(sessionId, recovery, revision)) || canceled()) return canceledResult;
      return { recovery, continueInSession: switched };
    })();
    preparing.set(sessionId, task);
    try { result = await task; } finally { preparing.delete(sessionId); }
  }
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...result });
}
