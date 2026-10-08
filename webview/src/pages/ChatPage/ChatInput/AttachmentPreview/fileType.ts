/**
 * What kind of thing a file is, judged by its extension alone, so a card can pick
 * an icon without reading a single byte of the file.
 */
export enum FileKind {
  Pdf = 'pdf',
  Document = 'document',
  Spreadsheet = 'spreadsheet',
  Presentation = 'presentation',
  Text = 'text',
  Code = 'code',
  Archive = 'archive',
  Video = 'video',
  Audio = 'audio',
  Image = 'image',
  Other = 'other',
}

const EXTENSIONS: Record<Exclude<FileKind, FileKind.Other>, readonly string[]> = {
  [FileKind.Pdf]: ['pdf'],
  [FileKind.Document]: ['doc', 'docx', 'odt', 'rtf', 'pages'],
  [FileKind.Spreadsheet]: ['xls', 'xlsx', 'csv', 'tsv', 'ods', 'numbers', 'gsheet'],
  [FileKind.Presentation]: ['ppt', 'pptx', 'key', 'odp', 'gslides'],
  [FileKind.Text]: ['txt', 'md', 'mdx', 'log', 'gdoc'],
  [FileKind.Code]: [
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'yml', 'yaml', 'toml', 'xml', 'html', 'htm', 'css', 'scss',
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh', 'bash',
    'zsh', 'sql', 'gradle', 'vue', 'svelte', 'lua', 'dart', 'ini', 'env',
  ],
  [FileKind.Archive]: ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'dmg', 'jar'],
  [FileKind.Video]: ['mov', 'mp4', 'm4v', 'webm', 'mkv', 'avi', 'wmv'],
  [FileKind.Audio]: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac', 'aiff'],
  [FileKind.Image]: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'ico', 'avif'],
};

const KIND_BY_EXTENSION = new Map<string, FileKind>(
  Object.entries(EXTENSIONS).flatMap(([kind, extensions]) => extensions.map((ext) => [ext, kind as FileKind] as const)),
);

/** The extension without its dot, lower-cased; empty when the name has none. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  // A leading dot (`.gitignore`) or a trailing one names no extension.
  if (dot <= 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot + 1).toLowerCase();
}

export function fileKindOf(fileName: string): FileKind {
  return KIND_BY_EXTENSION.get(extensionOf(fileName)) ?? FileKind.Other;
}

/** The extension as a short upper-case tag for the icon, cut to what fits on it. */
export function extensionTag(fileName: string): string {
  return extensionOf(fileName).slice(0, 4).toUpperCase();
}
