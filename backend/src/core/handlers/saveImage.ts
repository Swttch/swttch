import { existsSync } from 'fs';
import { stat, unlink, writeFile } from 'fs/promises';
import { basename } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import { MessageType } from '../../shared';
import type { IPCMessage } from '../types';

/** The most a picture sent to be saved may be: a page's picture is some hundreds of KB. */
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * SAVE_IMAGE: save a picture the webview made (a screenshot of a page) where the person chooses, `{ suggestedName,
 * base64 }`. ACKed with `{ path }`, null when they cancelled, or with `{ error }`.
 *
 * Saving from inside the page does not work everywhere: the IDE's embedded browser does not carry a download out of a
 * blob address at all, and says nothing. So the save dialog is the host's own (the IDE's in JetBrains mode, the platform's
 * in standalone) and the bytes are written here. The hosts' dialog-and-write takes text, so it is asked to write nothing,
 * which only names the file, and this writes the picture over it.
 */
export async function saveImageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const reply = (body: Record<string, unknown>) => connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });
  const { suggestedName, base64 } = (message.payload ?? {}) as { suggestedName?: unknown; base64?: unknown };
  if (typeof suggestedName !== 'string' || suggestedName === '' || typeof base64 !== 'string') return reply({ error: 'bad-request' });
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return reply({ error: 'bad-size' });
  try {
    const { path } = await bridge.saveFile({ suggestedName, contents: '' });
    if (path === null) return reply({ path: null });
    // The IDE's dialog can hand back the name without the extension it was offered with; a picture that has none
    // is saved as `.png`, unless that would write over a file of that name.
    const named = /\.[A-Za-z0-9]{1,5}$/.test(basename(path)) || existsSync(`${path}.png`) ? path : `${path}.png`;
    await writeFile(named, bytes);
    // The dialog's own empty file of the name without the extension is left behind otherwise.
    if (named !== path && (await stat(path).catch(() => null))?.size === 0) await unlink(path).catch(() => undefined);
    reply({ path: named });
  } catch (err) {
    console.error('[node-backend]', 'SAVE_IMAGE failed:', err);
    reply({ error: err instanceof Error ? err.message : String(err) });
  }
}
