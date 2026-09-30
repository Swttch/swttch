import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Claude } from '../claude';
import {
  readCliAutoUpdateState,
  readNonessentialTrafficState,
  saveCliAutoUpdate,
  saveNonessentialTraffic,
} from '../features/cli-auto-update-setting';
import { readMergedClaudeSettings } from '../features/claude-settings';
import { MessageType } from '../../shared';

/**
 * Settle the global Claude data directory first, exactly as `Claude.exec` does before the
 * background check runs `claude doctor` with no project. The toggle and that check then read
 * the same settings.json, which is what keeps them from disagreeing.
 */
async function applyGlobalConfigDir(): Promise<void> {
  await Claude.applyConfigDir();
}

export async function getCliAutoUpdateHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  await applyGlobalConfigDir();
  const state = await readCliAutoUpdateState();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    ...state,
  });
}

export async function setCliAutoUpdateHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const enabled = message.payload?.enabled;
  if (typeof enabled !== 'boolean') {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'enabled must be a boolean',
    });
    return;
  }

  await applyGlobalConfigDir();
  const result = await saveCliAutoUpdate(enabled);
  if (result.status === 'ok') {
    // The file watcher says the same thing a moment later, but only when it is running;
    // announcing it here keeps every open tab in step either way, as SAVE_CLAUDE_SETTINGS does.
    const { settings, overrides } = await readMergedClaudeSettings();
    connections.broadcastToAll(MessageType.CLAUDE_SETTINGS_CHANGED, { settings, overrides });
  }
  const state = await readCliAutoUpdateState();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    ...state,
    ...result,
  });
}

export async function getNonessentialTrafficHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  await applyGlobalConfigDir();
  const state = await readNonessentialTrafficState();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    ...state,
  });
}

export async function setNonessentialTrafficHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const disabled = message.payload?.disabled;
  if (typeof disabled !== 'boolean') {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'disabled must be a boolean',
    });
    return;
  }

  await applyGlobalConfigDir();
  const result = await saveNonessentialTraffic(disabled);
  if (result.status === 'ok') {
    // The About screen's auto-update switch reads the same variable; this keeps it in step.
    const { settings, overrides } = await readMergedClaudeSettings();
    connections.broadcastToAll(MessageType.CLAUDE_SETTINGS_CHANGED, { settings, overrides });
  }
  const state = await readNonessentialTrafficState();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    ...state,
    ...result,
  });
}
