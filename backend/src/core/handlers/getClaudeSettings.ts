import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import {
  readMergedClaudeSettings,
  readClaudeSettings,
  readProjectClaudeSettings,
  type UnreadableSettingsFile,
} from '../features/claude-settings';
import { getSettingsWatcher } from '../features/settings-watcher';
import { MessageType } from '../../shared';

export async function getClaudeSettingsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDir = message.payload?.workingDir as string | undefined;
  const scope = message.payload?.scope as 'global' | 'project' | 'merged' | undefined;

  if (workingDir) {
    getSettingsWatcher()?.registerProject(workingDir);
  }

  let settings: Record<string, unknown>;
  let overrides: string[] = [];
  let unreadable: UnreadableSettingsFile[] = [];

  if (scope === 'global') {
    settings = await readClaudeSettings();
  } else if (scope === 'project' && workingDir) {
    settings = await readProjectClaudeSettings(workingDir);
  } else {
    const result = await readMergedClaudeSettings(workingDir);
    settings = result.settings;
    overrides = result.overrides;
    unreadable = result.unreadable;
  }

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    settings,
    overrides,
    unreadable,
  });
}
