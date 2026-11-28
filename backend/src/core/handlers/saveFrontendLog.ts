import { rm, stat } from 'fs/promises';
import { dirname, resolve } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import { MessageType } from '../../shared';
import type { IPCMessage } from '../types';
import { saveCopyWhereChosen } from './saveSentFile';
import { uploadsBaseDir } from './uploadFileChunk';

/** The upload directory that holds `path` alone, or null when `path` is not a file one upload made. */
function uploadDirOf(path: string): string | null {
  const dir = dirname(resolve(path));
  return dirname(dir) === resolve(uploadsBaseDir()) ? dir : null;
}

/**
 * SAVE_FRONTEND_LOG: save the front log the webview uploaded where the person chooses, `{ path, suggestedName }`.
 * ACKed with `{ path }` (where it was saved), `{ path: null }` when they cancelled, or `{ error }`.
 *
 * The uploaded copy holds the conversation, so it is removed as soon as the answer is known rather than left for the
 * upload directory's own clean-up days later. Only a file inside the upload directory is accepted, since it is removed.
 */
export async function saveFrontendLogHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const reply = (body: Record<string, unknown>) => connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });
  const { path, suggestedName } = (message.payload ?? {}) as { path?: unknown; suggestedName?: unknown };
  if (typeof path !== 'string' || typeof suggestedName !== 'string' || suggestedName === '') return reply({ error: 'bad-request' });
  const dir = uploadDirOf(path);
  if (dir === null) return reply({ error: 'bad-request' });
  try {
    if (!(await stat(path).catch(() => null))?.isFile()) return reply({ error: 'unreadable' });
    reply({ path: await saveCopyWhereChosen(bridge, path, suggestedName, () => undefined) });
  } catch (err) {
    console.error('[node-backend]', 'SAVE_FRONTEND_LOG failed:', err);
    reply({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
