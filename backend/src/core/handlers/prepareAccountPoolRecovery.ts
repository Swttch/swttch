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

/**
 * One switch at a time across the whole backend.
 *
 * Usage lookups stay parallel — they share their `ccb` children and answer sooner
 * for it — but the credential slot they lead to is a single shared thing, and
 * sessions that recover together arrive at it together. Unserialized, two sessions
 * switch past each other and the second undoes the first, which strands the session
 * that already restarted on credentials it no longer has.
 */
let poolSwitching: Promise<unknown> = Promise.resolve();
function serializePoolSwitch<T>(action: () => Promise<T>): Promise<T> {
  const operation = poolSwitching.then(action, action);
  poolSwitching = operation.then(() => undefined, () => undefined);
  return operation;
}
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
      // The account THIS session's CLI is authenticated as, which is the one that
      // ran out. The registry answers for the backend, and a session that recovered
      // a moment earlier has already moved that answer on; rotating around it would
      // skip the account this session still has to leave.
      const limitedAccountId = connections.getAccountId(sessionId) ?? registry.current;
      let usageLookupFailed = false;
      let currentResetsAt: string | null = null;
      const selected = await selectAccountPoolAccount(registry, model, async accountId => {
        try {
          const usage = await fetchAccountUsage(accountId);
          const resetsAt = accountResetsAt(usage, model);
          if (resetsAt === null) usageLookupFailed = true;
          if (accountId === limitedAccountId) currentResetsAt = resetsAt || null;
          return usage;
        }
        catch (error) { usageLookupFailed = true; throw error; }
      }, limitedAccountId);
      if (canceled()) return canceledResult;
      if (!selected) {
        if (!limitedAccountId) return { recovery: null, continueInSession: false };
        const recovery = { sourceMessageUuid, accountId: limitedAccountId, resetsAt: currentResetsAt, awaitingLimit: false, ...(usageLookupFailed ? { usageLookupFailed: true } : {}) };
        if (!(await writeAccountPoolRecovery(sessionId, recovery, revision)) || canceled()) return canceledResult;
        return { recovery, continueInSession: false };
      }
      const switched = selected.accountId !== limitedAccountId;
      if (switched) {
        const outcome = await serializePoolSwitch(async () => {
          if (canceled()) return 'canceled' as const;
          // Another session may have already moved the shared slot to this very
          // account. Re-reading the registry inside the lock is what tells "someone
          // beat me to it" apart from "nobody has switched yet"; without it this
          // session would swap credentials that are already correct, and the
          // outgoing snapshot it refreshes on the way would be the wrong one.
          if ((await readRegistry()).current !== selected.accountId) {
            await switchToAccount(selected.accountId, () => !canceled());
            if (canceled()) return 'canceled' as const;
            resetUsageCache();
            resetAllUsageCache();
            connections.broadcastToAll(MessageType.ACCOUNTS_CHANGED, {});
          }
          // Restarted either way: the shared slot being right says nothing about
          // THIS session's process, which is still running as the account that ran
          // out until it is replaced.
          const proc = connections.getProcess(sessionId);
          if (proc) await restartClaudeSessionProcess(connections, sessionId, proc);
          return 'switched' as const;
        }).catch((error: unknown) => {
          if (canceled()) return 'canceled' as const;
          throw error;
        });
        if (outcome === 'canceled') return canceledResult;
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
