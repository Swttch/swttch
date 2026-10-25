import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { saveClaudeSettingToScope, readMergedClaudeSettings } from '../features/claude-settings';
import { MessageType } from '../../shared';

export async function saveClaudeSettingsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const key = message.payload?.key as string;
  const value = message.payload?.value;
  const scope = (message.payload?.scope as 'global' | 'project') || 'global';
  const workingDir = message.payload?.workingDir as string | undefined;

  const result = await saveClaudeSettingToScope(key, value, scope, workingDir);

  if (result.status === 'ok') {
    const { settings, overrides, unreadable } = await readMergedClaudeSettings(workingDir);
    connections.broadcastToAll(MessageType.CLAUDE_SETTINGS_CHANGED, { settings, overrides, unreadable });
  }

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    ...result,
  });
}
