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
  /**
   * A short slice of what the user typed alongside the image, for the Assets
   * timeline to label the group with.
   *
   * Truncated rather than complete: this is a caption in an index, and a long
   * prompt would bloat a reply whose whole purpose is to stay small. The full
   * text is always available over the normal session-load path, so nothing is
   * lost — only this copy is short.
   */
  messagePreview: string;
}

/**
 * What happened, for the Assets telemetry. Sent as `ASSET_ACTIVITY`'s `kind`.
 *
 * These become part of the EVENT NAME rather than a property, because Rybbit
 * counts unique users per event name but (as far as we could measure) cannot
 * filter users by a custom property. A conversion rate needs people, not hits,
 * so anything a rate is computed from has to be its own event.
 */
export enum AssetActivityKind {
  /** A non-sponsor opened a viewer that had images out of reach. Once per open. */
  GateSeen = 'gate_seen',
  /** They followed that invitation to the sponsor page. */
  GateClicked = 'gate_clicked',
  /** The Assets screen was opened. Carries which entry point did it. */
  ScreenOpened = 'screen_opened',
}

/**
 * Which of the three doors into the Assets screen was used.
 *
 * Appended to the event name for the same reason as {@link AssetActivityKind}:
 * "how many PEOPLE came through the dock" is the question, and one person
 * opening it twenty times must not read like twenty people.
 */
export enum AssetScreenSource {
  /** The header dock icon — hidden by default, which is what makes this worth measuring. */
  Dock = 'dock',
  /** The ⋮ overflow menu row. */
  Overflow = 'overflow',
  /** The grid button in the image viewer's bottom panel. */
  Viewer = 'viewer',
}
