import { useEffect, useState } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';

/** Sizes already asked for, by path: a chip that remounts must not ask again. */
const SIZE_CACHE_LIMIT = 200;
const cache = new Map<string, Promise<number | null>>();

async function ask(path: string): Promise<number | null> {
  const answer = (await getBridge().request(MessageType.GET_FILE_PREVIEW, { path, metadataOnly: true })) as
    | { size?: number }
    | undefined;
  return typeof answer?.size === 'number' ? answer.size : null;
}

/**
 * How big the file at `path` is, or null when the backend cannot say. Never
 * rejects: a size that cannot be had is left out of the tooltip, not reported.
 */
export function loadFileSize(path: string): Promise<number | null> {
  const known = cache.get(path);
  if (known) return known;

  const pending = ask(path).catch((): number | null => {
    // A dropped connection says nothing about the file, so the next ask goes through.
    cache.delete(path);
    return null;
  });

  if (cache.size >= SIZE_CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(path, pending);
  return pending;
}

/** @internal test-only: forget every remembered size. */
export function _resetFileSizeCache(): void {
  cache.clear();
}

/** The size of the file at `path`, or null while unknown. Pass undefined to ask about nothing. */
export function useFileSize(path: string | undefined): number | null {
  const [loaded, setLoaded] = useState<{ path: string; size: number | null } | null>(null);

  useEffect(() => {
    if (path === undefined) return;
    let current = true;
    void loadFileSize(path).then((size) => {
      if (current) setLoaded({ path, size });
    });
    return () => {
      current = false;
    };
  }, [path]);

  return path !== undefined && loaded?.path === path ? loaded.size : null;
}
