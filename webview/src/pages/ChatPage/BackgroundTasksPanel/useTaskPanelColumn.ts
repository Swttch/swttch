import { useSyncExternalStore } from 'react';
import { useWorkflowState } from '@/contexts/WorkflowStateContext';
import { MIN_CHAT_WIDTH, MIN_PANE_WIDTH, maxPaneWidth, useIsWide } from '@/components/FilePreviewPane/usePaneColumn';

/**
 * The Background tasks panel's width as a CSS length: 24rem, never so wide that the chat beside it
 * drops under its minimum. The minimum is in screen pixels, so it is divided by the UI zoom to land
 * on the page's own pixels, as the preview pane's width is.
 */
export const TASK_PANEL_WIDTH_CSS = `min(24rem, calc((100vw - ${MIN_CHAT_WIDTH}px) / var(--ui-zoom, 1)))`;

/**
 * True while the Background tasks panel takes a column beside the chat: it is open and the window
 * is wide enough, by the same rule as the preview pane. Narrower, it floats over the chat as before.
 */
export function useTaskPanelColumn(): boolean {
  const { panelOpen } = useWorkflowState();
  const wide = useIsWide();
  return panelOpen && wide;
}

// The width the reader dragged the panel to, in screen pixels; null while it has its default width. Kept for the life
// of the page, as the preview pane's is.
let draggedWidth: number | null = null;
const listeners = new Set<() => void>();

export const taskPanelWidthStore = {
  get: (): number | null => draggedWidth,
  /** Remember the width the reader dragged to (null goes back to the default). */
  set: (next: number | null): void => {
    draggedWidth = next === null ? null : Math.round(Math.max(MIN_PANE_WIDTH, next));
    listeners.forEach((l) => l());
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** The most the panel may take while it sits beside the chat, in screen pixels. */
export const maxTaskPanelWidth = (windowWidth: number): number => maxPaneWidth(windowWidth, true);

/**
 * The panel's width as a CSS length: where the reader dragged it to, else 24rem, never so wide that the chat beside it
 * drops under its minimum. The dragged width is in screen pixels, so it is divided by the UI zoom as the minimum is.
 */
export function taskPanelWidthCss(dragged: number | null): string {
  if (dragged === null) return TASK_PANEL_WIDTH_CSS;
  return `min(calc(${dragged}px / var(--ui-zoom, 1)), calc((100vw - ${MIN_CHAT_WIDTH}px) / var(--ui-zoom, 1)))`;
}

/** The panel's width as a CSS length, following the reader's drag. */
export function useTaskPanelWidthCss(): string {
  const dragged = useSyncExternalStore(taskPanelWidthStore.subscribe, taskPanelWidthStore.get);
  return taskPanelWidthCss(dragged);
}
