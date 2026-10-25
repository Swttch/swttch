/**
 * How the chat draws a file Claude sent with `SendUserFile`, by its extension.
 *
 * Taken from what Claude Desktop does with the same files (observed, not guessed):
 * a player for `mp4`, `mov` and `webm` video and for `mp3` and `wav` sound, a
 * thumbnail for `png`, `jpg`, `gif`, `webp`, `bmp` and `avif` pictures, and a card
 * for everything else, `svg` and the video container `m4v` among them.
 */
export type SentFileKind = 'video' | 'audio' | 'picture' | 'file';

const VIDEO = new Set(['mp4', 'mov', 'webm']);
const AUDIO = new Set(['mp3', 'wav']);
const PICTURE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif']);

/** The extension of `name`, lower case and without the dot, or an empty string. */
export function sentFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function sentFileKind(name: string): SentFileKind {
  const extension = sentFileExtension(name);
  if (VIDEO.has(extension)) return 'video';
  if (AUDIO.has(extension)) return 'audio';
  if (PICTURE.has(extension)) return 'picture';
  return 'file';
}
