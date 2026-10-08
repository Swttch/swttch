import { mkdir, readdir, rm, stat, writeFile, appendFile } from 'fs/promises';
import { homedir } from 'os';
import { basename, join } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';

/**
 * A browser never tells the page where a dropped file lives on disk, so the
 * webview sends the bytes and this handler writes them under the user-data
 * directory. The final chunk answers with the absolute path, which the webview
 * turns into the same file chip a JetBrains drop produces.
 *
 * One chunk per request, each ACKed before the next is sent: the ACK is the
 * backpressure, so a multi-gigabyte recording never queues up in the socket.
 */

/** Leftover copies older than this are removed when a new upload starts. */
const STALE_UPLOAD_MS = 7 * 24 * 60 * 60 * 1000;

/** A chunk carries at most this much base64 (the webview sends 512KiB of bytes per chunk). */
const MAX_CHUNK_BASE64_LENGTH = 4 * 1024 * 1024;

const UPLOAD_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Read on each call rather than captured at import, like the other stores under
 * the user-data directory, so a test can point `CCG_HOME` at a temp directory.
 */
export function uploadsBaseDir(): string {
  const home = process.env.CCG_HOME?.trim();
  return home ? join(home, 'uploads') : join(homedir(), '.claude-code-gui', 'uploads');
}

/**
 * Keep the name the user saw on the chip, but never let it name a place outside
 * the upload directory: only the last path segment survives and control
 * characters are dropped. Everything else, including Korean and spaces, stays.
 */
export function sanitizeUploadFileName(raw: string): string {
  const lastSegment = basename(raw.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const cleaned = lastSegment.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'file';
  return cleaned;
}

async function pruneStaleUploads(): Promise<void> {
  const base = uploadsBaseDir();
  let entries: string[];
  try {
    entries = await readdir(base);
  } catch {
    return;
  }
  const cutoff = Date.now() - STALE_UPLOAD_MS;
  for (const entry of entries) {
    const dir = join(base, entry);
    try {
      const info = await stat(dir);
      if (info.mtimeMs < cutoff) await rm(dir, { recursive: true, force: true });
    } catch {
      // Best effort: a directory that vanished or is locked is not worth failing an upload for.
    }
  }
}

function fail(connections: ConnectionManager, connectionId: string, message: IPCMessage, error: string): void {
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'error',
    error,
  });
}

export async function uploadFileChunkHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload ?? {};
  const uploadId = payload.uploadId;
  const fileName = payload.fileName;
  const offset = payload.offset;
  const base64 = payload.base64;
  const last = payload.last === true;

  if (typeof uploadId !== 'string' || !UPLOAD_ID_PATTERN.test(uploadId)) {
    return fail(connections, connectionId, message, 'Invalid uploadId');
  }
  if (typeof fileName !== 'string') {
    return fail(connections, connectionId, message, 'Invalid fileName');
  }
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    return fail(connections, connectionId, message, 'Invalid offset');
  }
  if (typeof base64 !== 'string' || base64.length > MAX_CHUNK_BASE64_LENGTH) {
    return fail(connections, connectionId, message, 'Invalid chunk');
  }

  const dir = join(uploadsBaseDir(), uploadId);
  const filePath = join(dir, sanitizeUploadFileName(fileName));
  const bytes = Buffer.from(base64, 'base64');

  try {
    if (offset === 0) {
      void pruneStaleUploads();
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, bytes);
    } else {
      // A chunk that does not continue exactly where the file ends means one went
      // missing or arrived twice; appending anyway would silently corrupt the file.
      const written = (await stat(filePath)).size;
      if (written !== offset) {
        return fail(connections, connectionId, message, `Chunk offset ${offset} does not match ${written} bytes written`);
      }
      await appendFile(filePath, bytes);
    }
  } catch (err) {
    return fail(connections, connectionId, message, err instanceof Error ? err.message : String(err));
  }

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    ...(last ? { path: filePath } : {}),
  });
}
