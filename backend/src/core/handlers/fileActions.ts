import { existsSync } from 'fs';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { ClientEnv } from '../../shared';
import { resolveOpenFilePath } from '../features/resolveOpenFilePath';
import { ackOpenFile, resolveOpenFileBridge } from './openFile';

type FileAction = (target: Bridge, path: string) => Promise<void>;

/**
 * Run an action on a clicked file through the bridge that can do it, and ack with
 * `{ ok, reason? }` like OPEN_FILE does so the webview can tell the user when it
 * did not work. The path is resolved the same way an open is: a Git Bash, WSL or
 * UNC spelling becomes the one this machine can see.
 */
async function runFileAction(
  action: FileAction,
  label: string,
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
  bridges: Record<ClientEnv, Bridge>,
): Promise<void> {
  const requestedPath = message.payload?.filePath;
  if (typeof requestedPath !== 'string' || requestedPath.length === 0) {
    ackOpenFile(connections, connectionId, message, { ok: false, reason: 'no-path' });
    return;
  }
  const filePath = resolveOpenFilePath(requestedPath);
  if (!existsSync(filePath)) {
    console.error('[node-backend]', `${label}: not found:`, filePath);
    ackOpenFile(connections, connectionId, message, { ok: false, reason: 'not-found' });
    return;
  }
  try {
    await action(resolveOpenFileBridge(connectionId, connections, bridge, bridges), filePath);
  } catch (err) {
    console.error('[node-backend]', `${label} failed:`, err);
    ackOpenFile(connections, connectionId, message, { ok: false, reason: 'open-failed' });
    return;
  }
  ackOpenFile(connections, connectionId, message, { ok: true });
}

/** OPEN_FILE_WITH_SYSTEM_APP: open the file with the system's default app, not an IDE editor. */
export function openFileWithSystemAppHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
  bridges: Record<ClientEnv, Bridge>,
): Promise<void> {
  return runFileAction(
    (target, path) => target.openFileWithSystemApp(path),
    'Open file with system app',
    connectionId,
    message,
    connections,
    bridge,
    bridges,
  );
}

/** REVEAL_FILE: show the file in the system's file manager. */
export function revealFileHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
  bridges: Record<ClientEnv, Bridge>,
): Promise<void> {
  return runFileAction(
    (target, path) => target.revealFile(path),
    'Reveal file',
    connectionId,
    message,
    connections,
    bridge,
    bridges,
  );
}
