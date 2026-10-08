import { open, readFile, stat } from 'fs/promises';
import { extname } from 'path';

/**
 * What a card can show of a file instead of its icon: the first lines of a text
 * file, a picture the browser can draw, or a video the webview takes a frame from.
 * `none` means "show the icon", which is also the answer for anything too big,
 * unreadable or binary: a preview is a courtesy and never a reason to fail.
 */
export type FilePreview =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mimeType: string; base64: string }
  | { kind: 'video'; mimeType: string; base64: string }
  | { kind: 'none' };

const NONE: FilePreview = { kind: 'none' };

/** Pictures a browser draws as they are; the rest (heic, tiff, raw) get the icon. */
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
};

/** Containers a browser can usually decode. Whether THIS file decodes is the webview's call. */
const VIDEO_TYPES: Record<string, string> = {
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
};

/**
 * The only files shown as their first lines: plain text, markup and the source
 * languages everyone has met. This is a list of names, not a guess from the bytes,
 * on purpose. Whether a file is text says little about whether its first lines are
 * worth showing (a `.kts` or a `gradlew` is text and reads as noise at that size),
 * and the Finder draws the same line: it previews the types the system has a
 * generator for and shows the icon of the rest. Anything off this list, or with no
 * extension, keeps its icon.
 */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'mdx', 'log', 'json', 'jsonc', 'csv', 'tsv', 'patch', 'diff', 'xml', 'html', 'htm',
  'css', 'scss', 'yml', 'yaml', 'toml', 'ini', 'conf', 'env', 'properties', 'sql',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp',
  'hpp', 'cs', 'php', 'sh', 'bash', 'zsh',
]);

/**
 * The same limit a picture has when it is pasted or dropped inline. A picture
 * picked by path is shown and opened like one, so it must not give up at a size
 * where the inline kind would still be accepted. Phone photos are mostly 2 to 8 MB.
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
/** How much of a file is read to find its first lines. */
const TEXT_SNIFF_BYTES = 4096;
const TEXT_LINES = 12;
const TEXT_LINE_CHARS = 40;

function firstLines(bytes: Buffer): FilePreview {
  // A NUL byte never appears in text, so one means the file is binary.
  if (bytes.includes(0)) return NONE;
  const text = bytes.toString('utf-8');
  // A file that is mostly bytes UTF-8 cannot decode is not text either.
  const broken = (text.match(/�/g) ?? []).length;
  if (broken > text.length / 20) return NONE;

  const lines = text
    .split(/\r?\n/)
    .slice(0, TEXT_LINES)
    .map((line) => line.slice(0, TEXT_LINE_CHARS).replace(/�/g, ''));
  const joined = lines.join('\n').trimEnd();
  return joined === '' ? NONE : { kind: 'text', text: joined };
}

/** A preview together with the file's size in bytes, which every answer for a real file carries. */
export type FilePreviewAnswer = FilePreview & { size?: number };

async function previewOf(path: string, size: number): Promise<FilePreview> {
  const extension = extname(path).slice(1).toLowerCase();

  const imageType = IMAGE_TYPES[extension];
  if (imageType) {
    if (size > MAX_IMAGE_BYTES) return NONE;
    return { kind: 'image', mimeType: imageType, base64: (await readFile(path)).toString('base64') };
  }

  const videoType = VIDEO_TYPES[extension];
  if (videoType) {
    if (size > MAX_VIDEO_BYTES) return NONE;
    return { kind: 'video', mimeType: videoType, base64: (await readFile(path)).toString('base64') };
  }

  if (!TEXT_EXTENSIONS.has(extension)) return NONE;

  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(TEXT_SNIFF_BYTES, size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return firstLines(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

/**
 * What the file at `path` can show of itself, with its size.
 *
 * `metadataOnly` answers with the size alone and reads no content, for a chip that
 * has no room for a preview but still names its size in a tooltip.
 */
export async function readFilePreview(path: string, options: { metadataOnly?: boolean } = {}): Promise<FilePreviewAnswer> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return NONE;
    if (options.metadataOnly || info.size === 0) return { ...NONE, size: info.size };
    return { ...(await previewOf(path, info.size)), size: info.size };
  } catch {
    // Gone, unreadable or locked: the card keeps its icon.
    return NONE;
  }
}
