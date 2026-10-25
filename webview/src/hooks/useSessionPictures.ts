import { useMemo } from 'react';
import type { SessionAsset, SessionOutput } from '@/shared';
import { assetKey, useSessionAssetLoader, useSessionAssets } from './useSessionAssets';
import { isPictureOutput, outputKey, useSessionOutputImages, useSessionOutputs } from './useSessionOutputs';

/**
 * One picture of the session, whichever list it came from: an image the user
 * attached, or one Claude made (a picture a tool returned, a sent png, jpg or gif).
 * The viewer steps through these in the order the conversation had them.
 */
export type SessionPicture =
  | { kind: 'asset'; key: string; entryUuid: string; timestamp: string | null; asset: SessionAsset }
  | { kind: 'output'; key: string; entryUuid: string; timestamp: string | null; output: SessionOutput };

/**
 * Two lists that are each in conversation order, folded into one. An entry with
 * no timestamp is taken as soon as it is next in its own list: without a time it
 * cannot be placed against the other list, and staying put keeps each list's own order.
 */
export function mergePictures(assets: SessionAsset[], outputs: SessionOutput[]): SessionPicture[] {
  const merged: SessionPicture[] = [];
  let a = 0;
  let o = 0;
  while (a < assets.length || o < outputs.length) {
    const nextAsset = assets[a];
    const nextOutput = outputs[o];
    const takeAsset =
      nextOutput === undefined ||
      (nextAsset !== undefined &&
        (nextAsset.timestamp === null || nextOutput.timestamp === null || nextAsset.timestamp <= nextOutput.timestamp));
    if (takeAsset) {
      merged.push({ kind: 'asset', key: assetKey(nextAsset), entryUuid: nextAsset.entryUuid, timestamp: nextAsset.timestamp, asset: nextAsset });
      a++;
    } else {
      merged.push({ kind: 'output', key: outputKey(nextOutput), entryUuid: nextOutput.entryUuid, timestamp: nextOutput.timestamp, output: nextOutput });
      o++;
    }
  }
  return merged;
}

/** Every picture of the current session in conversation order, or undefined until both indexes are read. */
export function useSessionPictures(enabled: boolean): SessionPicture[] | undefined {
  const assets = useSessionAssets(enabled);
  const outputs = useSessionOutputs(enabled);
  return useMemo(
    () => (assets === undefined || outputs === undefined ? undefined : mergePictures(assets, outputs.filter(isPictureOutput))),
    [assets, outputs],
  );
}

/** Fetches the bytes of either kind of picture on demand and remembers them, keyed by {@link SessionPicture.key}. */
export function useSessionPictureLoader(): {
  loaded: Record<string, string>;
  ensure: (picture: SessionPicture) => void;
  ensureAsset: (asset: SessionAsset) => void;
  ensureOutput: (output: SessionOutput) => void;
} {
  const assetLoader = useSessionAssetLoader();
  const outputLoader = useSessionOutputImages();
  const loaded = useMemo(() => ({ ...assetLoader.loaded, ...outputLoader.loaded }), [assetLoader.loaded, outputLoader.loaded]);
  const ensureAsset = assetLoader.ensure;
  const ensureOutput = outputLoader.ensure;
  return {
    loaded,
    ensure: (picture) => (picture.kind === 'asset' ? ensureAsset(picture.asset) : ensureOutput(picture.output)),
    ensureAsset,
    ensureOutput,
  };
}
