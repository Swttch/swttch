import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { saveSettingToScope, readMergedSettings } from '../features/settings';
import { Claude } from '../claude';
import { MessageType } from '../../shared';

export async function saveSettingsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const key = message.payload?.key as string;
  const value = message.payload?.value;
  const scope = (message.payload?.scope as 'global' | 'project') || 'global';
  const workingDir = message.payload?.workingDir as string | undefined;

  const result = await saveSettingToScope(key, value, scope, workingDir);

  // Re-resolve against the scope that was just written, so a project-scoped CLI
  // path takes effect for that project instead of re-reading only the global one.
  if (result.status === 'ok' && key === 'cliPath') {
    await Claude.refresh(workingDir);
  }

  // Push the new hostMode to the IDE so Kotlin's cache stays in sync and chat windows
  // route to the chosen host immediately. The backend owns settings; Kotlin no longer
  // reads the file for hostMode (it diverges from the JVM home on WSL2 — issue #7).
  // Only the JetBrains bridge exposes the push; browser mode has no IDE to notify.
  //
  // Scope matters: a project-scoped save is addressed to the windows serving that
  // project only. Broadcasting it would flip the chat host in unrelated projects.
  if (result.status === 'ok' && key === 'hostMode' && typeof value === 'string') {
    const pushable = bridge as Bridge & {
      pushHostModeForProject?: (hostMode: string, projectPath?: string) => void;
    };
    pushable.pushHostModeForProject?.(value, scope === 'project' ? workingDir : undefined);
  }

  // Broadcast merged settings after save
  if (result.status === 'ok') {
    const { settings, overrides } = await readMergedSettings(workingDir);
    connections.broadcastToAll(MessageType.SETTINGS_CHANGED, { settings, overrides });
  }

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    ...result,
  });
}
