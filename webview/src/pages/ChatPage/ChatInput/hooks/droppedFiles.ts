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
  /** The folder's own listing, which is the only way to reach what is inside it. */
  directory: FileSystemDirectoryEntry | null;
}

/**
 * Read everything a drop or a paste carried. Must run synchronously inside the
 * event: the browser empties the `DataTransfer` as soon as the handler returns,
 * and `webkitGetAsEntry()` is the only way to tell a folder from a file.
 */
export function readDroppedEntries(dataTransfer: DataTransfer): DroppedEntry[] {
  const entries: DroppedEntry[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (!file) continue;
    const entry = item.webkitGetAsEntry?.();
    const directory = entry?.isDirectory ? (entry as FileSystemDirectoryEntry) : null;
    entries.push({ file, isDirectory: directory !== null, directory });
  }
  if (entries.length > 0) return entries;
  // Engines that expose no `items` still list the files.
  return Array.from(dataTransfer.files ?? []).map((file) => ({ file, isDirectory: false, directory: null }));
}

/** A file found inside a dropped folder, with where it sat below that folder. */
export interface FolderFile {
  file: File;
  /** The folder's own name, then any subfolders, then the file: `photos/2026/a.png`. */
  relativePath: string;
}

function readAllEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  return new Promise((resolve, reject) => {
    const found: FileSystemEntry[] = [];
    // `readEntries` hands back a batch at a time (Chrome stops at 100), and an
    // empty batch is the only sign the listing is over.
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(found);
          return;
        }
        found.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

function readFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** Every file below a dropped folder, however deep. Empty folders have nothing to carry. */
export async function collectFolderFiles(directory: FileSystemDirectoryEntry): Promise<FolderFile[]> {
  const files: FolderFile[] = [];
  const walk = async (current: FileSystemDirectoryEntry, prefix: string): Promise<void> => {
    for (const entry of await readAllEntries(current)) {
      const relativePath = `${prefix}/${entry.name}`;
      if (entry.isDirectory) {
        await walk(entry as FileSystemDirectoryEntry, relativePath);
      } else {
        files.push({ file: await readFile(entry as FileSystemFileEntry), relativePath });
      }
    }
  };
  await walk(directory, directory.name);
  return files;
}

function readBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

interface UploadAck {
  status?: string;
  error?: string;
  path?: string;
  rootPath?: string;
}

type Request = (type: string, payload: Record<string, unknown>) => Promise<UploadAck | undefined>;

/** Thrown when the person removes a chip while its bytes are still travelling. */
export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled');
  }
}

/** What the caller wants to know about, and how it can stop, an upload in flight. */
export interface UploadControl {
  /** Called after every chunk the backend has stored: bytes sent so far of the bytes in total. */
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  /** Asked before every chunk; true ends the upload with {@link UploadCancelledError}. */
  isCancelled?: () => boolean;
}

/**
 * Send one file chunk by chunk. Each chunk waits for its ACK before the next goes
 * out, so a large recording never piles up in the socket. Returns the ACK of the
 * last chunk, which carries the saved path.
 *
 * `sentBefore` and `total` place this file inside a bigger transfer (a folder),
 * so the progress it reports is the whole transfer's, not the file's.
 */
async function sendFile(
  file: File,
  request: Request,
  upload: { uploadId: string; relativePath?: string },
  control: UploadControl,
  sentBefore: number,
  total: number,
): Promise<UploadAck> {
  let offset = 0;
  for (;;) {
    if (control.isCancelled?.()) throw new UploadCancelledError();
    const end = Math.min(offset + UPLOAD_CHUNK_BYTES, file.size);
    const last = end >= file.size;
    const ack = await request(MessageType.UPLOAD_FILE_CHUNK, {
      uploadId: upload.uploadId,
      fileName: file.name,
      ...(upload.relativePath === undefined ? {} : { relativePath: upload.relativePath }),
      offset,
      base64: await readBase64(file.slice(offset, end)),
      last,
    });
    if (ack?.status === 'error') throw new Error(ack.error ?? 'Upload failed');
    control.onProgress?.(sentBefore + end, total);
    if (last) {
      if (!ack?.path) throw new Error('Upload finished without a saved path');
      return ack;
    }
    offset = end;
  }
}

/**
 * Hand a file to the backend and get back the absolute path it was saved at.
 *
 * A browser never exposes where a dropped file lives on disk, so the bytes go
 * over the socket instead and the backend writes them under the user-data
 * directory.
 */
export async function uploadFile(file: File, request: Request, control: UploadControl = {}): Promise<string> {
  const ack = await sendFile(file, request, { uploadId: crypto.randomUUID() }, control, 0, file.size);
  return ack.path as string;
}

/** Bytes a folder's files add up to, which is what its progress counts against. */
export function totalBytesOf(files: FolderFile[]): number {
  return files.reduce((sum, { file }) => sum + file.size, 0);
}

/**
 * Hand a whole folder to the backend and get back the absolute path of the saved
 * copy of that folder. Its files keep their places below it, so the model can
 * walk the copy the way it would walk the original.
 */
export async function uploadFolder(files: FolderFile[], request: Request, control: UploadControl = {}): Promise<string> {
  if (files.length === 0) throw new Error('The folder has no files to upload');
  const uploadId = crypto.randomUUID();
  const total = totalBytesOf(files);
  let sentBefore = 0;
  let rootPath: string | undefined;
  for (const { file, relativePath } of files) {
    const ack = await sendFile(file, request, { uploadId, relativePath }, control, sentBefore, total);
    rootPath = ack.rootPath ?? rootPath;
    sentBefore += file.size;
  }
  if (!rootPath) throw new Error('Upload finished without a saved folder path');
  return rootPath;
}
