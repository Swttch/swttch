import { useCallback, useEffect, useState } from 'react';
import { runExtApi, useExtCapabilities } from './useExtApi';
import { useSessionScope } from './useSessionAssets';
import type { SessionArtifact } from './useSessionArtifact';

/** One entry of the account's artifact list, as `swttch-ext api frame list` prints it (only what the pane uses). */
export interface FrameRecord {
  slug: string;
  title: string;
  /** The version currently live; the id a publish answers with. */
  live?: string;
  updatedAt?: string;
  /** Pinned. */
  starred?: boolean;
  /** `mine` for the account's own pages. */
  rel?: string;
  renamable?: boolean;
  duplicable?: boolean;
}

const REUSE_MS = 4_000;
let cached: { at: number; key: string; pending: Promise<FrameRecord[] | null> } | undefined;

/** @internal test-only. */
export function _resetFrameList(): void {
  cached = undefined;
}

function frameList(workingDir: string | undefined, fresh: boolean): Promise<FrameRecord[] | null> {
  const key = workingDir ?? '';
  if (!fresh && cached && cached.key === key && Date.now() - cached.at < REUSE_MS) return cached.pending;
  const pending = runExtApi('frame', 'list', { limit: '200' }, { workingDir }).then((answer) => {
    if (!answer.ok) return null;
    const frames = (answer.data as { frames?: FrameRecord[] } | null)?.frames;
    return Array.isArray(frames) ? frames : null;
  });
  cached = { at: Date.now(), key, pending };
  return pending;
}

/** The entry that is this page: by its live version id, else by its name when only one page has it. */
export function matchRecord(frames: FrameRecord[], artifact: Pick<SessionArtifact, 'versionId' | 'title'>, pageTitle?: string): FrameRecord | undefined {
  if (artifact.versionId) {
    const byVersion = frames.find((f) => f.live === artifact.versionId);
    if (byVersion) return byVersion;
  }
  for (const name of [pageTitle, artifact.title]) {
    if (!name) continue;
    const same = frames.filter((f) => f.title === name && f.rel === 'mine');
    if (same.length === 1) return same[0];
  }
  return undefined;
}

/** Why the record is missing, in the words the menu tells the reader. */
export type RecordGap = 'loading' | 'kitMissing' | 'kitTooOld' | 'notLinked';

/**
 * The account's own entry for a published page: its name on the server, whether it is pinned, when it
 * was updated, and what the account may do to it. Read through the kit's `swttch-ext`, so it is absent
 * where the kit is. `refresh` asks again, for after a change.
 */
export function useArtifactRecord(artifact: SessionArtifact | undefined, pageTitle?: string): {
  record: FrameRecord | undefined;
  gap: RecordGap | undefined;
  refresh: () => Promise<void>;
} {
  const caps = useExtCapabilities(artifact !== undefined);
  const { workingDir } = useSessionScope();
  const [record, setRecord] = useState<FrameRecord | undefined>(undefined);
  const [gap, setGap] = useState<RecordGap | undefined>('loading');

  const load = useCallback(
    async (fresh: boolean) => {
      if (!artifact || !caps) return;
      if (!caps.installed) {
        setRecord(undefined);
        setGap('kitMissing');
        return;
      }
      if (!caps.capabilities.includes('api.frame.list')) {
        setRecord(undefined);
        setGap('kitTooOld');
        return;
      }
      const frames = await frameList(workingDir, fresh);
      const found = frames ? matchRecord(frames, artifact, pageTitle) : undefined;
      setRecord(found);
      setGap(found ? undefined : 'notLinked');
    },
    [artifact, caps, workingDir, pageTitle],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return { record, gap, refresh: () => load(true) };
}
