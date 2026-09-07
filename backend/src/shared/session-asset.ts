/**
 * Where one attached image sits inside a session transcript.
 *
 * The CLI's JSONL gives images no id of their own — they are inline base64
 * blocks inside an entry's `message.content` array. So a coordinate has to be
 * built from what IS stable: the entry's uuid plus the block's position in that
 * array. Nothing in the transcript is renamed or rewritten to produce it.
 */
export interface SessionAssetRef {
  /** `uuid` of the JSONL entry holding the image. */
  entryUuid: string;
  /** Position of the image block within that entry's `message.content` array. */
  blockIndex: number;
}

/**
 * One row of the asset index: enough to lay out a gallery, without the bytes.
 *
 * The image data is deliberately absent. A heavy session holds ~20MB of base64
 * across a few dozen images, and shipping that with the list would push all of
 * it through the socket and into the DOM before the user has looked at any of
 * it. Callers fetch a single image by its ref when it is actually shown.
 *
 * This is an INDEX built alongside the transcript, not a trimmed-down copy of
 * it: the entries themselves still travel unedited over the normal session-load
 * path, so CLAUDE.md's original-data rule is satisfied — a range may be split,
 * an entry may not be edited.
 */
export interface SessionAsset extends SessionAssetRef {
  /** e.g. `image/png`. Taken from the block's own `source.media_type`. */
  mediaType: string;
  /** The holding entry's `timestamp`, or null when the entry carries none. */
  timestamp: string | null;
  /** Decoded size in bytes, derived from the base64 length. */
  byteSize: number;
}
