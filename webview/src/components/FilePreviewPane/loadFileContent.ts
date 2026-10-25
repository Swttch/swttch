import { getBridge } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';

export type FileContentKind = 'html' | 'image' | 'pdf' | 'video' | 'text';

/** What the backend answers for one piece (`backend/src/core/features/fileContent.ts`). */
interface BackendChunk {
  ok?: boolean;
  reason?: 'unsupported' | 'tooLarge' | 'unreadable';
  kind?: FileContentKind;
  mimeType?: string;
  size?: number;
  offset?: number;
  base64?: string;
  maxBytes?: number;
}

export type FileContentResult =
  | { ok: true; kind: FileContentKind; mimeType: string; blob: Blob; pieces: Uint8Array[] }
  | { ok: false; reason: 'unsupported' | 'tooLarge' | 'unreadable'; size?: number; maxBytes?: number };

/** The pieces of a page, read as the text they spell. A page is held in memory whole, so the pieces are joined first: a character can straddle two of them. */
export function decodeText(pieces: Uint8Array[]): string {
  const joined = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
  let at = 0;
  for (const piece of pieces) {
    joined.set(piece, at);
    at += piece.length;
  }
  return new TextDecoder().decode(joined);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The whole file at `path`, asked for one piece at a time so that no single
 * message is larger than the backend's piece size. Never rejects: whatever goes
 * wrong comes back as a reason the pane can put in words.
 *
 * `isCancelled` is checked between pieces, so a pane that was closed or pointed
 * at another file stops asking.
 */
export async function loadFileContent(path: string, isCancelled: () => boolean = () => false): Promise<FileContentResult> {
  const pieces: Uint8Array[] = [];
  let kind: FileContentKind | undefined;
  let mimeType = '';
  let loaded = 0;

  try {
    for (;;) {
      const answer = (await getBridge().request(MessageType.GET_FILE_CONTENT, { path, offset: loaded })) as BackendChunk | undefined;
      if (isCancelled()) return { ok: false, reason: 'unreadable' };
      if (!answer?.ok || !answer.kind || answer.size === undefined || answer.base64 === undefined) {
        return { ok: false, reason: answer?.reason ?? 'unreadable', size: answer?.size, maxBytes: answer?.maxBytes };
      }

      kind = answer.kind;
      mimeType = answer.mimeType ?? '';
      const bytes = base64ToBytes(answer.base64);
      pieces.push(bytes);
      loaded += bytes.length;

      // A piece that adds nothing before the end means the file shrank while it was read.
      if (loaded >= answer.size || bytes.length === 0) break;
    }
  } catch (err) {
    console.error('[FilePreviewPane] Failed to load file content:', err);
    return { ok: false, reason: 'unreadable' };
  }

  if (kind === undefined) return { ok: false, reason: 'unreadable' };
  return { ok: true, kind, mimeType, blob: new Blob(pieces as BlobPart[], { type: mimeType }), pieces };
}
