/** The file the preview pane is showing, with the line the click named when it had one. */
export interface FilePreviewTarget {
  path: string;
}

let target: FilePreviewTarget | null = null;
const listeners = new Set<() => void>();

function set(next: FilePreviewTarget | null): void {
  target = next;
  listeners.forEach((listener) => listener());
}

/**
 * The one preview pane the chat can show next to itself (#593). Clicking a file
 * path happens in many renderers, outside the pane's own component, so this is
 * the small shared state between a click and the pane.
 */
export const filePreviewPaneStore = {
  get: (): FilePreviewTarget | null => target,
  open: (path: string): void => set({ path }),
  close: (): void => set(null),
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
