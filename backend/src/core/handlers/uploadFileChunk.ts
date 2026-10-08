import { mkdir, readdir, rm, stat, writeFile, appendFile } from 'fs/promises';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';
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
  return cleanSegment(basename(raw.replace(/\\/g, '/'))) ?? 'file';
}

function cleanSegment(segment: string): string | null {
  // eslint-disable-next-line no-control-regex
  const cleaned = segment.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return null;
  return cleaned;
}

/**
 * The path of a file inside a dropped folder, as the folder's own name followed
 * by the subfolders down to the file. Every segment is cleaned on its own, and a
 * segment that would climb out of the upload directory (`..`) or names nothing is
 * dropped, so the result can only ever lead further in.
 */
export function sanitizeUploadRelativePath(raw: string): string[] {
  const segments = raw.split(/[\\/]/).map(cleanSegment).filter((s): s is string => s !== null);
  return segments.length > 0 ? segments : ['file'];
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
  const relativePath = payload.relativePath;
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
  // A file inside a dropped folder names where it sits below the folder; a lone
  // file is just its name. Either way the result stays inside this upload's directory.
  const segments = typeof relativePath === 'string'
    ? sanitizeUploadRelativePath(relativePath)
    : [sanitizeUploadFileName(fileName)];
  const filePath = join(dir, ...segments);
  const rootPath = segments.length > 1 ? join(dir, segments[0]) : undefined;
  const bytes = Buffer.from(base64, 'base64');

  try {
    if (offset === 0) {
      // Only the first file of an upload clears old copies: a folder of a thousand
      // files must not re-scan the whole directory a thousand times.
      const startedUpload = (await mkdir(dir, { recursive: true })) !== undefined;
      if (startedUpload) void pruneStaleUploads();
      if (dirname(filePath) !== dir) await mkdir(dirname(filePath), { recursive: true });
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
    ...(last ? { path: filePath, ...(rootPath ? { rootPath } : {}) } : {}),
  });
}
