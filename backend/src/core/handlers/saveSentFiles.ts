import { existsSync } from 'fs';
import { stat } from 'fs/promises';
import { basename, extname, join } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import type { IPCMessage } from '../types';
import { FILE_BYTES_MAX_BYTES } from '../features/fileBytes';
import { resolveSentFilePath } from '../features/sentFileStore';
import { copyWithProgress } from './saveSentFile';

/** The most files one request may carry: a message's cards, not a folder's worth. */
const MAX_FILES = 200;

/** `name` inside `folder`, or the first of `name (1)`, `name (2)`... that is free: a save never writes over a file. */
function freeTarget(folder: string, name: string): string {
  const extension = extname(name);
  const stem = name.slice(0, name.length - extension.length);
  let candidate = join(folder, name);
  for (let n = 1; existsSync(candidate); n++) candidate = join(folder, `${stem} (${n})${extension}`);
  return candidate;
}

/**
 * SAVE_SENT_FILES: save several files Claude sent into one folder the person already chose, `{ files: [{ path, name }],
 * folder }`. ACKed with `{ saved: [{ path, savedPath }], failed: [path] }`, or with `{ error }` when the request is wrong
 * or the folder is not a folder.
 *
 * Each file keeps its own name; a name already taken in the folder gets ` (1)`, ` (2)` after it instead of being written
 * over. Each file's progress goes out as it is copied, as {@link MessageType.SAVE_SENT_FILE_PROGRESS}, so each card fills
 * its own background.
 */
export async function saveSentFilesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
): Promise<void> {
  const reply = (body: Record<string, unknown>) => connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });
  const { files, folder } = (message.payload ?? {}) as { files?: unknown; folder?: unknown };
  const entries = Array.isArray(files) ? (files as Array<{ path?: unknown; name?: unknown }>) : null;
  if (
    !entries || entries.length === 0 || entries.length > MAX_FILES || typeof folder !== 'string' || folder === '' ||
    entries.some((entry) => typeof entry?.path !== 'string' || entry.path === '' || typeof entry.name !== 'string' || entry.name === '')
  ) {
    return reply({ error: 'bad-request' });
  }
  try {
    if (!(await stat(folder).catch(() => null))?.isDirectory()) return reply({ error: 'bad-folder' });
    const saved: Array<{ path: string; savedPath: string }> = [];
    const failed: string[] = [];
    for (const entry of entries as Array<{ path: string; name: string }>) {
      try {
        const source = await resolveSentFilePath(entry.path);
        const info = await stat(source).catch(() => null);
        if (!info?.isFile() || info.size > FILE_BYTES_MAX_BYTES) {
          failed.push(entry.path);
          continue;
        }
        const target = freeTarget(folder, basename(entry.name));
        await copyWithProgress(source, target, (loaded) =>
          connections.sendTo(connectionId, MessageType.SAVE_SENT_FILE_PROGRESS, { path: entry.path, loaded, size: info.size }));
        saved.push({ path: entry.path, savedPath: target });
      } catch (err) {
        console.error('[node-backend]', 'SAVE_SENT_FILES failed for one file:', err);
        failed.push(entry.path);
      }
    }
    reply({ saved, failed });
  } catch (err) {
    console.error('[node-backend]', 'SAVE_SENT_FILES failed:', err);
    reply({ error: err instanceof Error ? err.message : String(err) });
  }
}
