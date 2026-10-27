import { useCallback, useMemo } from 'react';
import { useSponsorStatus } from './queries/useSponsorStatus';
import { useSessionPictureLoader, useSessionPictures } from './useSessionPictures';

export interface SessionAssetGallery {
  /** What the viewer should show. `null` entries are indexed but not fetched. */
  srcs: (string | null)[];
  /** Where the viewer should open, translated into the list above. */
  initialIndex: number;
  /**
   * How many images elsewhere in the session are out of reach right now.
   * Zero for a sponsor (nothing is withheld) and zero when this message holds
   * everything the session has.
   */
  lockedCount: number;
  /** Hand to the viewer so a pending slot is fetched when it comes on screen. */
  onIndexChange: (index: number) => void;
  /**
   * Whether the session holds images outside this message at all.
   *
   * True for a sponsor too, where `lockedCount` is zero: the Assets screen is
   * still the way to see the session laid out, and without this the only route
   * to it is a dock icon that ships hidden.
   */
  hasMoreInSession: boolean;
}

/**
 * Decides what one lightbox opened from the transcript may step through.
 *
 * A non-sponsor stays inside the message they clicked. A sponsor steps across
 * the whole session, which the webview cannot do on its own: the transcript is
 * paged, so images attached earlier are simply not loaded. The session-wide list
 * comes from the backend index instead, and its bytes are fetched one at a time
 * as the user arrives at them — a heavy session is ~20MB of base64 and must not
 * be pulled down to open one image.
 *
 * The gate lives here, in one place, rather than in the viewer. The viewer
 * renders whatever list it is handed, so the same component serves the gated and
 * ungated cases without knowing which is which.
 */
export function useSessionAssetGallery(params: {
  /** The transcript entry these images belong to; absent while a turn streams. */
  entryUuid: string | undefined;
  /** The images of this message, already decoded in the transcript. */
  localSrcs: string[];
  /** Which of `localSrcs` was clicked; null while the viewer is closed. */
  openedLocalIndex: number | null;
  /**
   * The session-wide key of each of `localSrcs`, in the same order, for images Claude
   * made (a `Read` picture, a sent file) whose place in the session is not "the images
   * of this entry". Absent for attachments, which are found by `entryUuid`.
   */
  localKeys?: string[];
}): SessionAssetGallery {
  const { entryUuid, localSrcs, openedLocalIndex, localKeys } = params;
  const { isSponsor } = useSponsorStatus();

  const isOpen = openedLocalIndex !== null;
  // Both lists, merged: an attachment gallery steps into what Claude made and back.
  const pictures = useSessionPictures(isOpen);
  const { loaded, ensure } = useSessionPictureLoader();

  // The keys of this message's own images inside the session-wide list. Matching
  // attachments by entry uuid is what lets the already-decoded transcript copies be
  // reused instead of re-fetched; images Claude made are matched by the key they were given.
  const ownKeys = useMemo(() => {
    if (localKeys) return localKeys;
    return (pictures ?? []).filter((p) => p.kind === 'asset' && p.entryUuid === entryUuid).map((p) => p.key);
  }, [localKeys, pictures, entryUuid]);

  const localSrcByKey = useMemo(() => {
    const map = new Map<string, string>();
    ownKeys.forEach((key, i) => {
      if (i < localSrcs.length) map.set(key, localSrcs[i]);
    });
    return map;
  }, [ownKeys, localSrcs]);

  const total = pictures?.length ?? 0;
  const initialKey = openedLocalIndex !== null ? ownKeys[openedLocalIndex] : undefined;
  const initialAt = pictures && initialKey ? pictures.findIndex((p) => p.key === initialKey) : -1;

  const sessionWide = isSponsor && Boolean(entryUuid || localKeys) && ownKeys.length > 0 && total > 0 && initialAt >= 0;

  const srcs = useMemo<(string | null)[]>(() => {
    if (!sessionWide || !pictures) return localSrcs;
    // This message's own images are already in the transcript; reuse them rather
    // than asking the backend for bytes the page is holding.
    return pictures.map((picture) => localSrcByKey.get(picture.key) ?? loaded[picture.key] ?? null);
  }, [sessionWide, pictures, localSrcs, localSrcByKey, loaded]);

  const initialIndex = sessionWide ? initialAt : (openedLocalIndex ?? 0);

  const lockedCount = useMemo(() => {
    if (sessionWide || !pictures) return 0;
    return Math.max(total - localSrcs.length, 0);
  }, [sessionWide, pictures, total, localSrcs.length]);

  const hasMoreInSession = total > localSrcs.length;

  const onIndexChange = useCallback(
    (index: number) => {
      if (!sessionWide || !pictures) return;
      const picture = pictures[index];
      if (!picture) return;
      if (loaded[picture.key] || localSrcByKey.has(picture.key)) return;
      // A failed or `gone` fetch leaves the placeholder; the user can step away and back.
      ensure(picture);
    },
    [sessionWide, pictures, loaded, localSrcByKey, ensure],
  );

  return { srcs, initialIndex, lockedCount, onIndexChange, hasMoreInSession };
}
