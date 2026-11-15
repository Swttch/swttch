import { useState, useMemo, useEffect, KeyboardEvent } from 'react';
import { GroupedSessions, GROUP_ORDER } from './utils';

interface Params {
  groupedSessions: GroupedSessions;
  /** Re-highlight resets whenever this changes (typically the search query). */
  searchQuery: string;
  /** When false, the highlight clears and the refresh shortcut is disabled. */
  isActive: boolean;
  /** Resume/open the session at the given id (Enter on a highlighted row). */
  onSelect: (sessionId: string) => void;
  /** Reload the session list (Cmd/Ctrl+Shift+P). */
  onRefresh: () => void;
  /** Optional Escape handler (e.g. close a dropdown). Omitted for the always-on side panel. */
  onEscape?: () => void;
}

interface Result {
  /** Session highlighted by keyboard navigation, or null when none. */
  highlightedSessionId: string | null;
  /** Attach to the search input's onKeyDown. */
  handleSearchKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Keyboard navigation shared by the session dropdown and the side panel:
 * arrow-key highlight over the rows (in display order), Enter to select,
 * optional Escape, and Cmd/Ctrl+Shift+P to refresh the list. Issue #28.
 */
export function useSessionListKeyboard(params: Params): Result {
  const { groupedSessions, searchQuery, isActive, onSelect, onRefresh, onEscape } = params;

  // Cursor over the displayed rows. -1 = no row highlighted.
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Sessions in the exact order they render (group order, then within-group),
  // so arrow-key navigation matches what the user sees.
  const orderedSessions = useMemo(
    () => GROUP_ORDER.flatMap((group) => groupedSessions[group]),
    [groupedSessions],
  );
  const highlightedSessionId =
    highlightedIndex >= 0 ? orderedSessions[highlightedIndex]?.id ?? null : null;

  // Keep the cursor from pointing past the end as the list changes.
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);
  useEffect(() => {
    if (!isActive) setHighlightedIndex(-1);
  }, [isActive]);

  // Cmd/Ctrl+Shift+P refreshes the list while active.
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        onRefresh();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, onRefresh]);

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, orderedSessions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      const session = orderedSessions[highlightedIndex];
      // Nothing to open until the transcript of a session that was just started exists.
      if (session && session.provisional !== true) {
        e.preventDefault();
        onSelect(session.id);
      }
    } else if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      onEscape();
    }
  };

  return { highlightedSessionId, handleSearchKeyDown };
}
