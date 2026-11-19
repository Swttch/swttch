import { useWorkflowState } from '@/contexts/WorkflowStateContext';
import { MIN_CHAT_WIDTH, useIsWide } from '@/components/FilePreviewPane/usePaneColumn';

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
