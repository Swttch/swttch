import { useCallback, useMemo, useState } from 'react';
import type { SectionFoldValue } from './SectionFoldContext';

/**
 * Holds the set of collapsed send sections for the transcript on screen.
 *
 * A Set of keys rather than a flag per section: the collapsed ones are the few,
 * and an entry only exists for a section the user actually acted on. Sections
 * that arrive later — from streaming, or from loading an older page — are
 * absent from the Set and so are expanded, which is the right default without
 * anyone having to seed them.
 *
 * The identity of `isCollapsed` and `toggle` changes only when the Set does, so
 * the context value handed down is stable while the user scrolls and streams.
 */
export function useSectionFold(): SectionFoldValue {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const isCollapsed = useCallback((key: string) => collapsed.has(key), [collapsed]);

  // Copy rather than mutate: React compares by identity, and mutating the same
  // Set in place would leave the list rendering the previous fold state.
  const toggle = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  return useMemo(() => ({ isCollapsed, toggle }), [isCollapsed, toggle]);
}
