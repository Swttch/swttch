import { useEffect, useState } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { MessageType, type SessionOutput } from '@/shared';
import { useSessionScope } from './useSessionAssets';

/** What the session knows of one Artifact page it published. */
export interface SessionArtifact {
  title: string;
  /** The file on this machine the page was published from, when the call named one. */
  filePath?: string;
  timestamp: string | null;
}

/** An Artifact address's own id, which the same page's different spellings share. */
const idOf = (url: string): string | undefined => /artifact\/([A-Za-z0-9_-]+)/.exec(url)?.[1];

/** How long a list of the session's outputs is reused before the next chip asks again. */
const REUSE_MS = 3_000;
const lists = new Map<string, { at: number; pending: Promise<SessionOutput[]> }>();

function outputsOf(workingDir: string, sessionId: string): Promise<SessionOutput[]> {
  const key = `${workingDir}\u0000${sessionId}`;
  const known = lists.get(key);
  if (known && Date.now() - known.at < REUSE_MS) return known.pending;
  const pending = (getBridge().request(MessageType.GET_SESSION_OUTPUTS, { workingDir, sessionId }) as Promise<
    { status?: string; outputs?: SessionOutput[] } | undefined
  >)
    .then((res) => (res?.status === 'ok' && Array.isArray(res.outputs) ? res.outputs : []))
    .catch(() => {
      lists.delete(key);
      return [] as SessionOutput[];
    });
  lists.set(key, { at: Date.now(), pending });
  return pending;
}

/** @internal test-only. */
export function _resetSessionArtifactLists(): void {
  lists.clear();
}

/**
 * The Artifact page published at `url` in the current session, or undefined while
 * that is being asked or when the session published none there. The lists are
 * shared between chips drawn at once, so a reply with several costs one request.
 */
export function useSessionArtifact(url: string): SessionArtifact | undefined {
  const { workingDir, sessionId } = useSessionScope();
  const [artifact, setArtifact] = useState<SessionArtifact | undefined>(undefined);

  useEffect(() => {
    const id = idOf(url);
    if (!id || !workingDir || !sessionId) return;
    let alive = true;
    void outputsOf(workingDir, sessionId).then((outputs) => {
      if (!alive) return;
      const found = outputs.find((o) => o.kind === 'artifact' && idOf(o.url) === id);
      setArtifact(found && found.kind === 'artifact' ? { title: found.title, filePath: found.filePath, timestamp: found.timestamp } : undefined);
    });
    return () => {
      alive = false;
    };
  }, [url, workingDir, sessionId]);

  return artifact;
}
