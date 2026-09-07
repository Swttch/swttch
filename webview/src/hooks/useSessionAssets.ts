import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType, type SessionAsset, type SessionAssetRef } from '@/shared';
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

/** Stable identity of one image, shared by every cache that holds its bytes. */
export function assetKey(ref: SessionAssetRef): string {
  return `${ref.entryUuid}:${ref.blockIndex}`;
}

/** Where the current session lives, read tolerantly for renderers mounted outside the providers. */
export function useSessionScope(): { workingDir?: string; sessionId?: string } {
  const sessionId = useSessionContextOrNull()?.currentSessionId ?? undefined;
  const workingDir = useWorkingDirOrNull()?.workingDirectory ?? undefined;
  return { workingDir, sessionId };
}

/**
 * The index of every image the user attached in the current session.
 *
 * Shared by the lightbox and the Assets screen through one query key, so opening
 * the screen right after stepping through the transcript does not walk the
 * session a second time.
 *
 * `enabled` is the caller's decision and matters: a transcript holds dozens of
 * messages, and indexing per message on render would be dozens of full-session
 * walks nobody asked for.
 */
export function useSessionAssets(enabled: boolean): SessionAsset[] | undefined {
  const { send } = useBridgeContext();
  const { workingDir, sessionId } = useSessionScope();

  const { data } = useQuery({
    queryKey: ['session-assets', workingDir, sessionId],
    enabled: enabled && Boolean(workingDir && sessionId),
    staleTime: 30_000,
    queryFn: async (): Promise<SessionAsset[]> => {
      const res = await send<AssetsResponse>(MessageType.GET_SESSION_ASSETS, {
        workingDir,
        sessionId,
      });
      return res?.status === 'ok' && Array.isArray(res.assets) ? res.assets : [];
    },
  });

  return data;
}

/**
 * Fetches indexed images on demand and remembers the ones it got.
 *
 * Both surfaces that show session images need the same thing — ask for a
 * coordinate, keep the bytes, never ask twice — but they ask at different
 * moments: the viewer when the user steps onto a slot, the Assets timeline when
 * a thumbnail scrolls into view. Sharing the loader is what keeps those two from
 * growing separate caches of the same 20MB.
 */
export function useSessionAssetLoader(): {
  loaded: Record<string, string>;
  ensure: (asset: SessionAsset) => void;
} {
  const { send } = useBridgeContext();
  const { workingDir, sessionId } = useSessionScope();
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  // Coordinates already asked for, so a slot revisited mid-flight is not
  // requested twice.
  const inFlight = useRef<Set<string>>(new Set());

  const ensure = useCallback(
    (asset: SessionAsset) => {
      if (!workingDir || !sessionId) return;
      const key = assetKey(asset);
      if (loaded[key] || inFlight.current.has(key)) return;
      inFlight.current.add(key);

      void send<AssetDataResponse>(MessageType.GET_SESSION_ASSET_DATA, {
        workingDir,
        sessionId,
        entryUuid: asset.entryUuid,
        blockIndex: asset.blockIndex,
      })
        .then((res) => {
          // 'gone' means the entry was rewound away. The caller keeps its
          // placeholder, which is right for an image that no longer exists.
          if (res?.status !== 'ok' || !res.source?.data) return;
          const mediaType = res.source.media_type ?? asset.mediaType;
          setLoaded((prev) => ({ ...prev, [key]: `data:${mediaType};base64,${res.source!.data}` }));
        })
        .catch(() => {
          // Leave the placeholder and allow a retry on the next visit.
          inFlight.current.delete(key);
        });
    },
    [send, workingDir, sessionId, loaded],
  );

  return { loaded, ensure };
}

/**
 * One indexed image's bytes, as a data URL, fetched only once `enabled`.
 *
 * Per-image rather than per-list because a session's images are wanted a few at
 * a time — the slot the viewer is on, the thumbnails scrolled into view — and
 * ~20MB of base64 must never be pulled down to show one of them. React Query
 * keys them by coordinate, so a thumbnail and the viewer showing the same image
 * share a single fetch.
 *
 * A `gone` reply (the entry was rewound away) resolves to null rather than
 * throwing: the caller keeps its placeholder, which is the right outcome for an
 * image that no longer exists.
 */
export function useSessionAssetImage(
  ref: SessionAssetRef | null,
  mediaType: string,
  enabled: boolean,
): string | null {
  const { send } = useBridgeContext();
  const { workingDir, sessionId } = useSessionScope();

  const { data } = useQuery({
    queryKey: ['session-asset', workingDir, sessionId, ref?.entryUuid, ref?.blockIndex],
    enabled: enabled && Boolean(ref && workingDir && sessionId),
    staleTime: Infinity,
    queryFn: async (): Promise<string | null> => {
      const res = await send<AssetDataResponse>(MessageType.GET_SESSION_ASSET_DATA, {
        workingDir,
        sessionId,
        entryUuid: ref!.entryUuid,
        blockIndex: ref!.blockIndex,
      });
      if (res?.status !== 'ok' || !res.source?.data) return null;
      return `data:${res.source.media_type ?? mediaType};base64,${res.source.data}`;
    },
  });

  return data ?? null;
}
