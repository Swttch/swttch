import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Claude } from '../claude';

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { MessageType } from '../../shared';
import { isJetBrainsMode } from '../../config/environment';
import { getRawClientInfo } from '../features/telemetry';
import { formatClientInfo } from '../client-info';
import { getOsInfo } from '../os-info';

declare const __PLUGIN_VERSION__: string;

export function getPluginVersion(): string {
  // In bundled build (esbuild), __PLUGIN_VERSION__ is statically replaced with a string literal.
  // In unbundled dev mode (tsx, ts-node), it remains undeclared → typeof returns 'undefined'.
  if (typeof __PLUGIN_VERSION__ !== 'undefined') {
    return __PLUGIN_VERSION__;
  }
  // Fallback: read from package.json (unbundled dev mode only)
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(currentDir, '../../..', 'package.json');
  return JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
}

export async function getCliVersion(): Promise<string | null> {
  // Log detected path (non-blocking, for diagnostics)
  Claude.which().then(path => console.log('which claude\n', path ?? '(not found)', '\n'));

  try {
    const { stdout } = await Claude.exec(['--version'], { timeout: 5000 });
    const raw = stdout.trim();
    console.log('claude --version\n', raw, '\n');
    const match = raw.match(/^[\d.]+/);
    return match ? match[0] : raw;
  } catch {
    return null;
  }
}

export async function getVersionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  try {
    const [cliVersion, requiresRestart, osInfo] = await Promise.all([
      getCliVersion(),
      bridge.requiresRestart().catch(() => true),
      // Never rejects, but keep the guard so a future change cannot take About down.
      getOsInfo().catch(() => null),
    ]);
    const pluginVersion = getPluginVersion();
    // The IDE product string in JetBrains mode, the browser in standalone mode;
    // null when the backend genuinely has no client identity to report.
    const clientInfo = formatClientInfo(getRawClientInfo(), isJetBrainsMode);

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      pluginVersion,
      cliVersion,
      requiresRestart,
      clientInfo,
      osInfo,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
