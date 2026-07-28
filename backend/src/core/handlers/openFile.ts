import { existsSync } from 'fs';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { ClientEnv, MessageType } from '../../shared';

export async function openFileHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
  bridges: Record<ClientEnv, Bridge>,
): Promise<void> {
  const filePath = message.payload?.filePath as string;
  // Validate at runtime rather than asserting: a non-number line/column (a caller
  // slip) must not flow downstream to the IDE as a bogus coordinate.
  const rawLine = message.payload?.line;
  const rawColumn = message.payload?.column;
  const line = typeof rawLine === 'number' ? rawLine : undefined;
  const column = typeof rawColumn === 'number' ? rawColumn : undefined;
  // The project this open came from, so "open files with" resolves per project.
  const rawWorkingDir = message.payload?.workingDir;
  const workingDir = typeof rawWorkingDir === 'string' ? rawWorkingDir : undefined;

  if (filePath) {
    // Fail fast with feedback when the target does not exist: a clicked reference
    // to a path that isn't on disk (e.g. a made-up `src/app.ts:1`) otherwise opens
    // nothing silently. The backend owns file I/O and shares the machine with the
    // IDE/OS opener, so this existence check is authoritative for the webview.
    if (!existsSync(filePath)) {
      console.error('[node-backend]', 'Open file: not found:', filePath);
      ackOpenFile(connections, connectionId, message, { ok: false, reason: 'not-found' });
      return;
    }
    try {
      await resolveOpenFileBridge(connectionId, connections, bridge, bridges).openFile(
        filePath,
        line,
        column,
        workingDir,
      );
    } catch (err) {
      console.error('[node-backend]', 'Failed to open file:', err);
      ackOpenFile(connections, connectionId, message, { ok: false, reason: 'open-failed' });
      return;
    }
  }
  ackOpenFile(connections, connectionId, message, { ok: true });
}

/** ACK an OPEN_FILE request, carrying success so the webview can surface a failure. */
function ackOpenFile(
  connections: ConnectionManager,
  connectionId: string,
  message: IPCMessage,
  result: { ok: boolean; reason?: string },
): void {
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...result });
}

/**
 * Choose which bridge opens the file. A browser client normally uses the browser
 * bridge (the OS opener, which can't focus a line and launches the OS default
 * app). But when this backend also has a live IDE (Kotlin RPC) connection — e.g.
 * a browser tab opened from an IDE session — route the open to the IDE so the
 * file opens in the editor at its line/column. Standalone/dev browsers with no
 * IDE attached fall back to the browser bridge unchanged, and a JCEF client
 * already resolves to the JetBrains bridge.
 */
function resolveOpenFileBridge(
  connectionId: string,
  connections: ConnectionManager,
  bridge: Bridge,
  bridges: Record<ClientEnv, Bridge>,
): Bridge {
  if (connections.getClientEnv(connectionId) !== ClientEnv.BROWSER) return bridge;
  const jetbrains = bridges[ClientEnv.JETBRAINS];
  return jetbrains?.isConnected?.() ? jetbrains : bridge;
}
