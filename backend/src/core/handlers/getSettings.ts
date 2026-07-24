import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { ClientEnv, MessageType } from '../../shared';
import { readMergedSettings, readSettingsFile, readProjectSettings } from '../features/settings';
import { getSettingsWatcher } from '../features/settings-watcher';
import { ccgClientInfo } from '../../config/environment';

/**
 * Extract a short, human-readable IDE product name out of the raw client-info
 * string the JetBrains host reports (e.g. "IntelliJ IDEA 2024.1.4 (IC-241...)"
 * or "WebStorm 2024.1 (WS-...)"). Strips the version-and-after suffix, leaving
 * just the product name for display in settings.
 */
export function parseIdeProductName(clientInfo: string): string {
  if (!clientInfo) return '';
  return clientInfo.replace(/\s+\d[\d.]*.*$/, '').trim();
}

export async function getSettingsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
  bridges: Record<ClientEnv, Bridge>,
): Promise<void> {
  const workingDir = message.payload?.workingDir as string | undefined;
  const scope = message.payload?.scope as 'global' | 'project' | 'merged' | undefined;

  if (workingDir) {
    getSettingsWatcher()?.registerProject(workingDir);
  }

  let settings: Record<string, unknown>;
  let overrides: string[] = [];

  if (scope === 'global') {
    settings = await readSettingsFile();
  } else if (scope === 'project' && workingDir) {
    settings = await readProjectSettings(workingDir);
  } else {
    // Default: merged (for runtime use)
    const result = await readMergedSettings(workingDir);
    settings = result.settings;
    overrides = result.overrides;
  }

  const ideAttached = bridges[ClientEnv.JETBRAINS]?.isConnected?.() ?? false;
  const ideProduct = parseIdeProductName(ccgClientInfo);

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    settings,
    overrides,
    ideAttached,
    ideProduct,
  });
}
