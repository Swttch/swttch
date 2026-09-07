import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType, type SessionAsset } from '@/shared';
import { useSponsorStatus } from './queries/useSponsorStatus';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';

interface AssetsResponse {
  status?: string;
  assets?: SessionAsset[];
}

interface AssetDataResponse {
  status?: string;
  source?: { type?: string; data?: string; media_type?: string };
}

/** Identity of one indexed image, used as the cache key for its bytes. */
function keyOf(asset: SessionAsset): string {
  return `${asset.entryUuid}:${asset.blockIndex}`;
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

  // Read here, and tolerantly: a message renderer is reused in places where the
  // session providers are not mounted (isolated render tests, future embeds).
  // Without a session there is simply nothing session-wide to offer, which is
  // the same outcome as a closed viewer.
  const sessionId = useSessionContextOrNull()?.currentSessionId ?? undefined;
  const workingDir = useWorkingDirOrNull()?.workingDirectory ?? undefined;

  const isOpen = openedLocalIndex !== null;
  // Bytes fetched so far, keyed by coordinate. Kept beside the query rather than
  // inside it because slots are filled one at a time as the user moves.
  const [fetched, setFetched] = useState<Record<string, string>>({});

  // Only asked for once the viewer is open: a transcript can hold dozens of
  // messages, and indexing the session for each of them on render would be
  // dozens of full-session walks nobody asked for.
  const { data: assets } = useQuery({
    queryKey: ['session-assets', workingDir, sessionId],
    enabled: isOpen && Boolean(workingDir && sessionId),
    staleTime: 30_000,
    queryFn: async (): Promise<SessionAsset[]> => {
      const res = await send<AssetsResponse>(MessageType.GET_SESSION_ASSETS, {
        workingDir,
        sessionId,
      });
      return res?.status === 'ok' && Array.isArray(res.assets) ? res.assets : [];
    },
  });

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
      return fetched[keyOf(asset)] ?? null;
    });
  }, [sessionWide, assets, localSrcs, localOffset, entryUuid, fetched]);

  const initialIndex = sessionWide ? localOffset + (openedLocalIndex ?? 0) : (openedLocalIndex ?? 0);

  const lockedCount = useMemo(() => {
    if (sessionWide || !assets) return 0;
    return Math.max(assets.length - localSrcs.length, 0);
  }, [sessionWide, assets, localSrcs.length]);

  const onIndexChange = useCallback(
    (index: number) => {
      if (!sessionWide || !assets) return;
      const asset = assets[index];
      if (!asset) return;
      const key = keyOf(asset);
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

  return { srcs, initialIndex, lockedCount, onIndexChange };
}
