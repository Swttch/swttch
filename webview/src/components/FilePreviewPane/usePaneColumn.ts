import { useSyncExternalStore } from 'react';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';

/** The width of the pane when it sits beside the chat. */
export const PANE_COLUMN_WIDTH = 'min(45vw, 720px)';

/** Below this window width there is no room for two columns, so the pane covers the chat as before. */
const WIDE_QUERY = '(min-width: 760px)';

// An environment without media queries (a test DOM) has no way to say it is wide.
const queryWide = (): MediaQueryList | null => (typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY) : null);

function subscribeWide(listener: () => void): () => void {
  const query = queryWide();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}

/** True while the window is wide enough for the pane to be a column of its own. */
export function useIsWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => queryWide()?.matches ?? false);
}

/**
 * True while the preview pane takes a column beside the chat: it is open, the
 * window is wide enough, and the reader has not expanded it over the chat. The
 * chat gives up that width then, as Claude Desktop's does, rather than being
 * covered.
 */
export function usePaneColumn(): boolean {
  const open = useSyncExternalStore(filePreviewPaneStore.subscribe, () => filePreviewPaneStore.get() !== null);
  const expanded = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.isExpanded);
  const wide = useIsWide();
  return open && wide && !expanded;
}
