import { useCallback, useMemo, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
import { useSponsorStatus } from './queries/useSponsorStatus';
import { assetKey, useSessionAssets, useSessionScope } from './useSessionAssets';

interface AssetDataResponse {
  status?: string;
  source?: { type?: string; data?: string; media_type?: string };
}

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
}): SessionAssetGallery {
  const { entryUuid, localSrcs, openedLocalIndex } = params;
  const { send } = useBridgeContext();
  const { isSponsor } = useSponsorStatus();

  // Read tolerantly: a message renderer is reused in places where the session
  // providers are not mounted. Without a session there is simply nothing
  // session-wide to offer, the same outcome as a closed viewer.
  const { workingDir, sessionId } = useSessionScope();

  const isOpen = openedLocalIndex !== null;
  // Bytes fetched so far, keyed by coordinate. Kept beside the query rather than
  // inside it because slots are filled one at a time as the user moves.
  const [fetched, setFetched] = useState<Record<string, string>>({});

  const assets = useSessionAssets(isOpen);

  // Where this message's images sit inside the session-wide index. Matching by
  // entry uuid is what lets the already-decoded transcript copies be reused
  // instead of re-fetched.
  const localAssets = useMemo(
    () => (assets ?? []).filter((a) => a.entryUuid === entryUuid),
    [assets, entryUuid],
  );

  const sessionWide =
    isSponsor && Boolean(entryUuid) && localAssets.length > 0 && (assets?.length ?? 0) > 0;

  const localOffset = useMemo(() => {
    if (!sessionWide || !assets) return 0;
    return assets.findIndex((a) => a.entryUuid === entryUuid);
  }, [sessionWide, assets, entryUuid]);

  const srcs = useMemo<(string | null)[]>(() => {
    if (!sessionWide || !assets) return localSrcs;
    return assets.map((asset, i) => {
      // This message's own images are already in the transcript; reuse them
      // rather than asking the backend for bytes the page is holding.
      const local = i - localOffset;
      if (local >= 0 && local < localSrcs.length && asset.entryUuid === entryUuid) {
        return localSrcs[local];
      }
      return fetched[assetKey(asset)] ?? null;
    });
  }, [sessionWide, assets, localSrcs, localOffset, entryUuid, fetched]);

  const initialIndex = sessionWide ? localOffset + (openedLocalIndex ?? 0) : (openedLocalIndex ?? 0);

  const lockedCount = useMemo(() => {
    if (sessionWide || !assets) return 0;
    return Math.max(assets.length - localSrcs.length, 0);
  }, [sessionWide, assets, localSrcs.length]);

  const hasMoreInSession = (assets?.length ?? 0) > localSrcs.length;

  const onIndexChange = useCallback(
    (index: number) => {
      if (!sessionWide || !assets) return;
      const asset = assets[index];
      if (!asset) return;
      const key = assetKey(asset);
      if (fetched[key] || srcs[index]) return;

      void send<AssetDataResponse>(MessageType.GET_SESSION_ASSET_DATA, {
        workingDir,
        sessionId,
        entryUuid: asset.entryUuid,
        blockIndex: asset.blockIndex,
      })
        .then((res: AssetDataResponse) => {
          // 'gone' means the entry was rewound away while the viewer was open.
          // Leaving the slot null keeps the placeholder rather than erroring.
          if (res?.status !== 'ok' || !res.source?.data) return;
          const mediaType = res.source.media_type ?? asset.mediaType;
          setFetched((prev) => ({
            ...prev,
            [key]: `data:${mediaType};base64,${res.source!.data}`,
          }));
        })
        .catch(() => {
          // A failed fetch leaves the placeholder; the user can step away and back.
        });
    },
    [sessionWide, assets, fetched, srcs, send, workingDir, sessionId],
  );

  return { srcs, initialIndex, lockedCount, onIndexChange, hasMoreInSession };
}
