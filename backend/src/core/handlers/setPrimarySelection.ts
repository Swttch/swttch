import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { logDebug } from '../../logging/log-level';

/**
 * Hand the text the user just selected to the host, so it lands in the Linux
 * PRIMARY selection (#513).
 *
 * No answer is sent. The webview reports a selection and moves on, it does not
 * wait to hear that it was placed, and an acknowledgement for every change of a
 * selection would only add traffic nobody reads.
 *
 * An empty selection is dropped here rather than forwarded: dropping a
 * selection does not empty the PRIMARY selection in any other program, so
 * passing it on would wipe what the user can still paste.
 */
export async function setPrimarySelectionHandler(
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
    await bridge.setPrimarySelection({ text, workingDir });
  } catch (err) {
    // Debug, not error: this fires on every selection, and a selection that was
    // not placed is a missed convenience rather than a fault worth a red line.
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    logDebug('[node-backend]', `bridge.setPrimarySelection() failed: ${msg}`);
  }
}
