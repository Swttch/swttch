import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { logDebug } from '../../logging/log-level';

/**
 * Hand copied text to the host system clipboard.
 *
 * This is deliberately fire-and-forget: the browser already completed its
 * copy action, and a host that cannot reach its clipboard must not break the
 * webview connection or make the user wait for an acknowledgement.
 */
export async function setClipboardHandler(
  _connectionId: string,
  message: IPCMessage,
  _connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const text = message.payload?.text;
  if (typeof text !== 'string' || text.length === 0) return;

  const workingDirValue = message.payload?.workingDir;
  const workingDir =
    typeof workingDirValue === 'string' && workingDirValue.length > 0 ? workingDirValue : undefined;

  try {
    await bridge.setClipboard({ text, workingDir });
  } catch (err) {
    // Copy already happened in the browser. Keep a host failure quiet and do
    // not include the copied text in logs.
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    logDebug('[node-backend]', `bridge.setClipboard() failed: ${msg}`);
  }
}
