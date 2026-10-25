import { open, stat } from 'fs/promises';
import { FILE_CONTENT_CHUNK_BYTES } from './fileContent';
import { resolveSentFilePath } from './sentFileStore';

/** The most one save will read: a file any larger is refused before a byte is sent. */
export const FILE_BYTES_MAX_BYTES = 200 * 1024 * 1024;

export type FileBytesAnswer =
  | { ok: true; size: number; offset: number; base64: string }
  | { ok: false; reason: 'tooLarge' | 'unreadable'; size?: number; maxBytes?: number };

/**
 * The piece of the file at `path` that starts at `offset`, whatever the file is.
 *
 * What the download button on a sent file reads. A piece at a time, like the
 * preview pane, so no message carries more than {@link FILE_CONTENT_CHUNK_BYTES}.
 * A sent file whose original is gone is read from the copy kept when it was sent.
 */
export async function readFileBytesChunk(path: string, offset: number): Promise<FileBytesAnswer> {
  try {
    const readable = await resolveSentFilePath(path);
    const info = await stat(readable);
    if (!info.isFile()) return { ok: false, reason: 'unreadable' };
    if (info.size > FILE_BYTES_MAX_BYTES) return { ok: false, reason: 'tooLarge', size: info.size, maxBytes: FILE_BYTES_MAX_BYTES };

    const handle = await open(readable, 'r');
    try {
      const buffer = Buffer.alloc(Math.max(Math.min(FILE_CONTENT_CHUNK_BYTES, info.size - offset), 0));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      return { ok: true, size: info.size, offset, base64: buffer.subarray(0, bytesRead).toString('base64') };
    } finally {
      await handle.close();
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
