import { loadActiveChain, type SessionMessage } from './loadSessionMessages';
import type { SessionAsset, SessionAssetRef } from '../../shared';

/** Image blocks the CLI writes carry their bytes under `source`. */
interface ImageSource {
  type?: string;
  data?: string;
  media_type?: string;
}

/**
 * Decoded size of a base64 payload, without decoding it.
 *
 * Used instead of `Buffer.from(...).length` because that would materialize
 * every image in the session just to measure them.
 */
export function base64ByteLength(base64: string): number {
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor(base64.length / 4) * 3 - padding;
}

/**
 * The image blocks a USER attached, in the order they appear in the entry.
 *
 * Only blocks sitting directly in `message.content` count. An image nested in a
 * `tool_result` came back from a tool Claude ran (a screenshot it read), not
 * from the person, and the Assets screen is built around user messages — mixing
 * the two in would break the axis the timeline is laid out on.
 */
function userAttachedImages(entry: SessionMessage): { blockIndex: number; source: ImageSource }[] {
  if (entry.type !== 'user') return [];
  const message = entry.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return [];

  const found: { blockIndex: number; source: ImageSource }[] = [];
  content.forEach((block, blockIndex) => {
    if (!block || typeof block !== 'object') return;
    const b = block as Record<string, unknown>;
    if (b.type !== 'image') return;
    found.push({ blockIndex, source: (b.source ?? {}) as ImageSource });
  });
  return found;
}

/**
 * Index every image the user attached in one session, oldest first.
 *
 * Deliberately returns no image bytes. A heavy session holds ~20MB of base64
 * across a few dozen images; sending that with the list would push all of it
 * through the socket before the user has looked at any of it.
 *
 * Reads through `loadActiveChain`, so it reuses the same parse, subagent
 * injection and active-chain snapshot the transcript loader already built for
 * this session (and its cache). Following the active chain also means a fork or
 * a rewind hides the images on the abandoned branch, matching what the user
 * actually sees in the conversation.
 */
export async function collectSessionAssets(
  workingDir: string,
  sessionId: string,
): Promise<SessionAsset[]> {
  const chain = await loadActiveChain(workingDir, sessionId);
  const assets: SessionAsset[] = [];

  for (const entry of chain) {
    const entryUuid = entry.uuid;
    // Without a uuid there is no way to point back at the entry, so the image
    // would be listed and then unreachable.
    if (typeof entryUuid !== 'string' || !entryUuid) continue;

    const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : null;

    for (const { blockIndex, source } of userAttachedImages(entry)) {
      assets.push({
        entryUuid,
        blockIndex,
        mediaType: typeof source.media_type === 'string' ? source.media_type : 'image/png',
        timestamp,
        byteSize: source.type === 'base64' ? base64ByteLength(source.data ?? '') : 0,
      });
    }
  }

  return assets;
}

/**
 * The `source` object of one indexed image, passed through unedited.
 *
 * Returns null when the coordinate no longer resolves — the session was rewound
 * past that entry, or the index the caller holds is stale. Callers must treat
 * that as "this image is gone", not as an error.
 */
export async function readSessionAsset(
  workingDir: string,
  sessionId: string,
  ref: SessionAssetRef,
): Promise<ImageSource | null> {
  const chain = await loadActiveChain(workingDir, sessionId);
  const entry = chain.find((e) => e.uuid === ref.entryUuid);
  if (!entry) return null;

  const match = userAttachedImages(entry).find((i) => i.blockIndex === ref.blockIndex);
  return match ? match.source : null;
}
