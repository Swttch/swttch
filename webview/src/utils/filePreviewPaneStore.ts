/** The file the preview pane is showing, with the published address when the file is a page the agent published. */
export interface FilePreviewTarget {
  path: string;
  publishedUrl?: string;
}

let target: FilePreviewTarget | null = null;
let expanded = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function set(next: FilePreviewTarget | null): void {
  target = next;
  if (next === null) expanded = false;
  notify();
}

/**
 * The one preview pane the chat can show next to itself (#593). Clicking a file
 * path happens in many renderers, outside the pane's own component, so this is
 * the small shared state between a click and the pane.
 */
export const filePreviewPaneStore = {
  get: (): FilePreviewTarget | null => target,
  /** True while the pane covers the whole chat instead of sitting beside it. */
  isExpanded: (): boolean => expanded,
  open: (path: string, publishedUrl?: string): void => set(publishedUrl ? { path, publishedUrl } : { path }),
  toggleExpanded: (): void => {
    expanded = !expanded;
    notify();
  },
  close: (): void => set(null),
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
