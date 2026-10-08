import { MessageType } from '@/shared';

/**
 * Bytes of the file carried by one UPLOAD_FILE_CHUNK request. Base64 grows it by a
 * third, which keeps each message well under the backend's per-chunk limit.
 */
export const UPLOAD_CHUNK_BYTES = 512 * 1024;

export interface DroppedEntry {
  file: File;
  /** A dropped folder arrives as a `File` too, but its bytes cannot be read. */
  isDirectory: boolean;
}

/**
 * Read everything a drop carried. Must run synchronously inside the drop event:
 * the browser empties the `DataTransfer` as soon as the handler returns, and
 * `webkitGetAsEntry()` is the only way to tell a folder from a file.
 */
export function readDroppedEntries(dataTransfer: DataTransfer): DroppedEntry[] {
  const entries: DroppedEntry[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (!file) continue;
    entries.push({ file, isDirectory: item.webkitGetAsEntry?.()?.isDirectory === true });
  }
  if (entries.length > 0) return entries;
  // Engines that expose no `items` still list the files.
  return Array.from(dataTransfer.files ?? []).map((file) => ({ file, isDirectory: false }));
}

function readBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type Request = (type: string, payload: Record<string, unknown>) => Promise<{ status?: string; error?: string; path?: string } | undefined>;

/**
 * Hand a file to the backend and get back the absolute path it was saved at.
 *
 * A browser never exposes where a dropped file lives on disk, so the bytes go
 * over the socket instead and the backend writes them under the user-data
 * directory. Each chunk waits for its ACK before the next goes out, so a large
 * recording never piles up in the socket.
 */
export async function uploadFile(file: File, request: Request): Promise<string> {
  const uploadId = crypto.randomUUID();
  let offset = 0;
  for (;;) {
    const end = Math.min(offset + UPLOAD_CHUNK_BYTES, file.size);
    const last = end >= file.size;
    const ack = await request(MessageType.UPLOAD_FILE_CHUNK, {
      uploadId,
      fileName: file.name,
      offset,
      base64: await readBase64(file.slice(offset, end)),
      last,
    });
    if (ack?.status === 'error') throw new Error(ack.error ?? 'Upload failed');
    if (last) {
      if (!ack?.path) throw new Error('Upload finished without a saved path');
      return ack.path;
    }
    offset = end;
  }
}
