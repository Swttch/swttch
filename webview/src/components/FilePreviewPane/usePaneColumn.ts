import { useSyncExternalStore } from 'react';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';

/** The width of the pane when it sits beside the chat and the reader has not dragged it. */
export const DEFAULT_PANE_COLUMN_WIDTH = 'min(45vw, 720px)';

/** How narrow the pane or the chat may be dragged. */
export const MIN_PANE_WIDTH = 320;
export const MIN_CHAT_WIDTH = 360;

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

/** The pane's width as a CSS length: where the reader dragged it to, else the default. */
export function usePaneColumnWidth(): string {
  const dragged = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.getWidth);
  return dragged === null ? DEFAULT_PANE_COLUMN_WIDTH : `${dragged}px`;
}
