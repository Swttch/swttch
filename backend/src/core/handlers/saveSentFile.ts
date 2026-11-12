import { createReadStream, createWriteStream, existsSync } from 'fs';
import { stat, unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { basename, extname } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import { MessageType } from '../../shared';
import type { IPCMessage } from '../types';
import { FILE_BYTES_MAX_BYTES } from '../features/fileBytes';
import { resolveSentFilePath } from '../features/sentFileStore';

/** How often at most the written size is reported while a file is copied: a progress bar needs no more than this. */
const PROGRESS_INTERVAL_MS = 50;

/** Copies `source` to `target`, reporting the bytes written so far at the start, now and then, and at the end. */
async function copyWithProgress(source: string, target: string, onProgress: (loaded: number) => void): Promise<void> {
  const input = createReadStream(source);
  let loaded = 0;
  let last = 0;
  onProgress(0);
  input.on('data', (chunk) => {
    loaded += chunk.length;
    const now = Date.now();
    if (now - last >= PROGRESS_INTERVAL_MS) {
      last = now;
      onProgress(loaded);
    }
  });
  await pipeline(input, createWriteStream(target));
  onProgress(loaded);
}

/**
 * SAVE_SENT_FILE: save a file Claude sent where the person chooses, `{ path, suggestedName }`. ACKed with
 * `{ path }` (where it was saved), `{ path: null }` when they cancelled, or `{ error }`.
 *
 * The file is copied here, from the file itself (or from the copy kept when it was sent, once the original is
 * gone), so no byte goes through the webview. The save dialog is the host's own (the IDE's in JetBrains mode, the
 * platform's in standalone), which is the only dialog the IDE's embedded browser can show for a save. The hosts'
 * dialog-and-write takes text, so it is asked to write nothing, which only names the file, and this writes the
 * file over it.
 */
export async function saveSentFileHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const reply = (body: Record<string, unknown>) => connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });
  const { path, suggestedName } = (message.payload ?? {}) as { path?: unknown; suggestedName?: unknown };
  if (typeof path !== 'string' || path === '' || typeof suggestedName !== 'string' || suggestedName === '') return reply({ error: 'bad-request' });
  try {
    const source = await resolveSentFilePath(path);
    const info = await stat(source).catch(() => null);
    if (!info?.isFile()) return reply({ error: 'unreadable' });
    if (info.size > FILE_BYTES_MAX_BYTES) return reply({ error: 'tooLarge' });
    const { path: chosen } = await bridge.saveFile({ suggestedName, contents: '' });
    if (chosen === null) return reply({ path: null });
    // The IDE's dialog can hand back the name without the extension it was offered with; the file is then saved
    // with its own extension, unless that would write over a file of that name.
    const extension = extname(suggestedName);
    const named = extname(basename(chosen)) !== '' || extension === '' || existsSync(`${chosen}${extension}`) ? chosen : `${chosen}${extension}`;
    // What the file card draws as its background while this runs: how much of the file is written, as {path, loaded, size}.
    const progress = (loaded: number) => connections.sendTo(connectionId, MessageType.SAVE_SENT_FILE_PROGRESS, { path, loaded, size: info.size });
    await copyWithProgress(source, named, progress);
    // The dialog's own empty file of the name without the extension is left behind otherwise.
    if (named !== chosen && (await stat(chosen).catch(() => null))?.size === 0) await unlink(chosen).catch(() => undefined);
    reply({ path: named });
  } catch (err) {
    console.error('[node-backend]', 'SAVE_SENT_FILE failed:', err);
    reply({ error: err instanceof Error ? err.message : String(err) });
  }
}
