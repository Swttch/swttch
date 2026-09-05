import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { verifyAccountSwitch } from '../features/account-switch-preflight';
import { restartClaudeSessionProcess } from '../claude-process';
import { AccountSwitchPreflightOutcome } from '../../shared';

export async function verifyAccountSwitchHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as { workingDir?: string; sessionId?: string } | undefined;
  const workingDir = payload?.workingDir;
  const result = await verifyAccountSwitch(workingDir);
  if (result.outcome === AccountSwitchPreflightOutcome.SUCCESS && payload?.sessionId) {
    const proc = connections.getProcess(payload.sessionId);
    if (proc) {
      await restartClaudeSessionProcess(connections, payload.sessionId, proc);
    }
  }
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    ...result,
  });
}
