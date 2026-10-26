import { useSyncExternalStore } from 'react';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';

/** The pane is never narrower than this, whether it sits beside the chat or floats over it. */
export const MIN_PANE_WIDTH = 250;
/** The room the chat keeps while the pane sits beside it. All of these widths are screen pixels. */
export const MIN_CHAT_WIDTH = 320;
/** The share of the window the pane takes until the reader drags it. */
export const DEFAULT_PANE_RATIO = 0.4;

/** The gap between the pane and the window's edges. */
const GUTTER_PX = 16;

/**
 * Below this window width two fifths of it is under the pane's minimum, so the pane has no
 * column of its own and floats over the chat.
 */
const WIDE_QUERY = `(min-width: ${MIN_PANE_WIDTH / DEFAULT_PANE_RATIO}px)`;

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
 * The room the pane may take: beside the chat it leaves the chat its minimum, floating it may
 * reach the window's edges. The chat is never squeezed under its minimum, so no minimum
 * can be beaten by a dragged width or a window that shrank afterwards.
 */
export function maxPaneWidth(windowWidth: number, column: boolean): number {
  return Math.max(MIN_PANE_WIDTH, windowWidth - (column ? MIN_CHAT_WIDTH : 0) - GUTTER_PX);
}

/**
 * The pane's width as a CSS length: where the reader dragged it to, else two fifths of the window,
 * never past the room. Every figure here is in screen pixels (the minimum is 250 on the screen
 * whatever the UI zoom, and 40vw is two fifths of the screen), so the result is divided by the
 * zoom the page is drawn at to land on the page's own pixels.
 */
export function paneWidthCss(dragged: number | null, column: boolean): string {
  const wanted = dragged === null ? `max(${MIN_PANE_WIDTH}px, ${DEFAULT_PANE_RATIO * 100}vw)` : `${Math.max(MIN_PANE_WIDTH, dragged)}px`;
  return `calc(min(${wanted}, 100vw - ${(column ? MIN_CHAT_WIDTH : 0) + GUTTER_PX}px) / var(--ui-zoom, 1))`;
}

/**
 * True while the preview pane takes a column beside the chat: it is open, the
 * window is wide enough, and the reader has not expanded it over the chat. The
 * chat gives up that width then; otherwise the pane floats over it.
 */
export function usePaneColumn(): boolean {
  const open = useSyncExternalStore(filePreviewPaneStore.subscribe, () => filePreviewPaneStore.get() !== null);
  const expanded = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.isExpanded);
  const wide = useIsWide();
  return open && wide && !expanded;
}

/** The width of the pane in the column or floating state. */
export function usePaneWidth(column: boolean): string {
  const dragged = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.getWidth);
  return paneWidthCss(dragged, column);
}
