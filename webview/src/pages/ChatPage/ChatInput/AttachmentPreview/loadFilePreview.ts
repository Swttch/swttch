import { getBridge } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';
import { videoFrame } from './videoFrame';

/** What a file card shows in place of the icon. */
export type FilePreviewResult =
  | { kind: 'text'; text: string }
  | { kind: 'image'; src: string }
  | { kind: 'none' };

const NONE: FilePreviewResult = { kind: 'none' };

/** Previews already asked for, by path: a card that remounts must not read the file again. */
const CACHE_LIMIT = 60;
const cache = new Map<string, Promise<FilePreviewResult>>();

interface BackendPreview {
  kind?: string;
  text?: string;
  mimeType?: string;
  base64?: string;
}

async function ask(path: string): Promise<FilePreviewResult> {
  const answer = (await getBridge().request(MessageType.GET_FILE_PREVIEW, { path })) as BackendPreview | undefined;

  if (answer?.kind === 'text' && answer.text) return { kind: 'text', text: answer.text };

  if (answer?.kind === 'image' && answer.mimeType && answer.base64) {
    return { kind: 'image', src: `data:${answer.mimeType};base64,${answer.base64}` };
  }

  if (answer?.kind === 'video' && answer.mimeType && answer.base64) {
    // A data URL turns into a Blob without copying the bytes through JavaScript.
    const blob = await (await fetch(`data:${answer.mimeType};base64,${answer.base64}`)).blob();
    const frame = await videoFrame(blob);
    return frame ? { kind: 'image', src: frame } : NONE;
  }

  return NONE;
}

/**
 * What the file at `path` can show of itself, or `none` when the icon is all there
 * is. Never rejects: a preview that cannot be had is not an error worth showing.
 */
export function loadFilePreview(path: string): Promise<FilePreviewResult> {
  const known = cache.get(path);
  if (known) return known;

  const pending = ask(path).catch((): FilePreviewResult => {
    // A dropped connection says nothing about the file, so it is not remembered
    // as "no preview" and the next card for this path asks again.
    cache.delete(path);
    return NONE;
  });

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(path, pending);
  return pending;
}

/** @internal test-only: forget every remembered preview. */
export function _resetFilePreviewCache(): void {
  cache.clear();
}
