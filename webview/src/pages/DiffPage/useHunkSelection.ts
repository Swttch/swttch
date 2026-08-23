import { useCallback, useMemo, useState } from 'react';
import { hunkToAcceptedRange, type Hunk, type AcceptedRange } from '@/shared';

export interface HunkSelection {
  /** Whether [index] will be written. */
  isKept(index: number): boolean;
  /** Flip one hunk between kept and dropped. */
  toggle(index: number): void;
  /** Keep every hunk. */
  keepAll(): void;
  /** Drop every hunk — which answers the request as a refusal. */
  dropAll(): void;
  /** How many hunks are kept. */
  keptCount: number;
  /** How many there are in total. */
  total: number;
  /** The kept hunks as ranges, ready to answer with. */
  acceptedRanges: AcceptedRange[];
}

/**
 * Which parts of a proposal the reviewer is keeping.
 *
 * Holds the DROPPED hunks rather than the kept ones. Everything starts kept —
 * the reviewer is looking at a proposal, not assembling one — so an empty set
 * is the initial state, and a hunk list that arrives later needs no seeding.
 * Tracking the kept side would mean an empty set could equally mean "not loaded
 * yet" or "refused everything", which are opposite answers.
 *
 * The answer itself is derived, never stored: a second copy of the selection is
 * a second thing to keep in step with the first.
 */
export function useHunkSelection(hunks: readonly Hunk[]): HunkSelection {
  const [dropped, setDropped] = useState<ReadonlySet<number>>(() => new Set());

  const toggle = useCallback((index: number) => {
    setDropped((prev) => {
      const next = new Set(prev);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  }, []);

  const keepAll = useCallback(() => setDropped(new Set()), []);

  const dropAll = useCallback(() => {
    setDropped(new Set(hunks.map((h) => h.index)));
  }, [hunks]);

  const isKept = useCallback((index: number) => !dropped.has(index), [dropped]);

  const kept = useMemo(() => hunks.filter((h) => !dropped.has(h.index)), [hunks, dropped]);

  const acceptedRanges = useMemo(
    // Ascending and non-overlapping, which is what the backend requires to
    // rebuild the file. computeHunks already emits them in order.
    () => kept.map(hunkToAcceptedRange),
    [kept],
  );

  return {
    isKept,
    toggle,
    keepAll,
    dropAll,
    keptCount: kept.length,
    total: hunks.length,
    acceptedRanges,
  };
}
