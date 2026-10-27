import { open, stat } from 'fs/promises';
import { extname } from 'path';
import { resolveSentFilePath } from './sentFileStore';

/**
 * The files the preview pane can show next to the chat, and how much of one it
 * will take (#593). Desktop's Browser pane shows the same kinds when a file path
 * in the chat is clicked.
 */
export type FileContentKind = 'html' | 'image' | 'pdf' | 'video' | 'text';

interface ContentType {
  kind: FileContentKind;
  mimeType: string;
  /** The most bytes of this kind the pane will load. */
  maxBytes: number;
}

const MB = 1024 * 1024;

/** A page is text the pane holds in memory and hands to a frame. */
const HTML_MAX_BYTES = 5 * MB;
const IMAGE_MAX_BYTES = 10 * MB;
/** Source and data files are shown as text, which the pane draws line by line, so the ceiling is small. */
const TEXT_MAX_BYTES = 2 * MB;
const PDF_MAX_BYTES = 50 * MB;
/** A video the pane plays from memory, so the ceiling is what a webview can hold comfortably. */
const VIDEO_MAX_BYTES = 200 * MB;

const CONTENT_TYPES: Record<string, ContentType> = {
  html: { kind: 'html', mimeType: 'text/html', maxBytes: HTML_MAX_BYTES },
  htm: { kind: 'html', mimeType: 'text/html', maxBytes: HTML_MAX_BYTES },
  pdf: { kind: 'pdf', mimeType: 'application/pdf', maxBytes: PDF_MAX_BYTES },
  png: { kind: 'image', mimeType: 'image/png', maxBytes: IMAGE_MAX_BYTES },
  jpg: { kind: 'image', mimeType: 'image/jpeg', maxBytes: IMAGE_MAX_BYTES },
  jpeg: { kind: 'image', mimeType: 'image/jpeg', maxBytes: IMAGE_MAX_BYTES },
  gif: { kind: 'image', mimeType: 'image/gif', maxBytes: IMAGE_MAX_BYTES },
  webp: { kind: 'image', mimeType: 'image/webp', maxBytes: IMAGE_MAX_BYTES },
  svg: { kind: 'image', mimeType: 'image/svg+xml', maxBytes: IMAGE_MAX_BYTES },
  bmp: { kind: 'image', mimeType: 'image/bmp', maxBytes: IMAGE_MAX_BYTES },
  avif: { kind: 'image', mimeType: 'image/avif', maxBytes: IMAGE_MAX_BYTES },
  // Text a reader opens to look at: shown as code with line numbers, as Desktop's file viewer does.
  ...Object.fromEntries(
    ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'xml', 'log', 'ini',
      'py', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'css', 'sh', 'sql', 'mmd', 'rb', 'go', 'rs', 'java', 'kt']
      .map((ext): [string, ContentType] => [ext, { kind: 'text', mimeType: 'text/plain', maxBytes: TEXT_MAX_BYTES }]),
  ),
  mp4: { kind: 'video', mimeType: 'video/mp4', maxBytes: VIDEO_MAX_BYTES },
  m4v: { kind: 'video', mimeType: 'video/x-m4v', maxBytes: VIDEO_MAX_BYTES },
  mov: { kind: 'video', mimeType: 'video/quicktime', maxBytes: VIDEO_MAX_BYTES },
  webm: { kind: 'video', mimeType: 'video/webm', maxBytes: VIDEO_MAX_BYTES },
};

/**
 * One piece of a file is sent per request, so no single message carries more than
 * this, and a large video does not become one frame the connection has to buffer.
 */
export const FILE_CONTENT_CHUNK_BYTES = 4 * MB;

export type FileContentAnswer =
  | {
      ok: true;
      kind: FileContentKind;
      mimeType: string;
      /** The whole file's size, so the pane knows when the last piece has arrived. */
      size: number;
      /** Where this piece starts in the file. */
      offset: number;
      /** When the file was last written, in milliseconds since the epoch. */
      modifiedAt: number;
      base64: string;
    }
  | { ok: false; reason: 'unsupported' | 'tooLarge' | 'unreadable'; size?: number; maxBytes?: number };

/** What the pane can show for `path`, decided by the extension alone, or undefined. */
export function contentTypeOf(path: string): ContentType | undefined {
  return CONTENT_TYPES[extname(path).slice(1).toLowerCase()];
}

/**
 * The piece of the file at `path` that starts at `offset`. The first piece
 * (offset 0) is where the size limit is checked, so a file that is too large
 * is refused before any of its bytes are sent.
 */
export async function readFileContentChunk(path: string, offset: number): Promise<FileContentAnswer> {
  const type = contentTypeOf(path);
  if (type === undefined) return { ok: false, reason: 'unsupported' };

  try {
    // A file Claude sent is read from the copy kept when it was sent once the original is gone.
    const readable = await resolveSentFilePath(path);
    const info = await stat(readable);
    if (!info.isFile()) return { ok: false, reason: 'unreadable' };
    if (info.size > type.maxBytes) return { ok: false, reason: 'tooLarge', size: info.size, maxBytes: type.maxBytes };

    const start = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
    const length = Math.max(0, Math.min(FILE_CONTENT_CHUNK_BYTES, info.size - start));
    const buffer = Buffer.alloc(length);
    if (length > 0) {
      const handle = await open(readable, 'r');
      try {
        await handle.read(buffer, 0, length, start);
      } finally {
        await handle.close();
      }
    }
    return {
      ok: true,
      kind: type.kind,
      mimeType: type.mimeType,
      size: info.size,
      offset: start,
      modifiedAt: info.mtimeMs,
      base64: buffer.toString('base64'),
    };
  } catch {
    // Gone, unreadable or locked: the pane says so and offers the editor.
    return { ok: false, reason: 'unreadable' };
  }
}
