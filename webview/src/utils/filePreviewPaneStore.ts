/** The file the preview pane is showing, with the published address when the file is a page the agent published. */
export interface FilePreviewTarget {
  path: string;
  publishedUrl?: string;
}

/** One tab of the browser pane: a file, which an address typed into the tab can change to another. */
export interface BrowserTab {
  id: number;
  path: string;
}

let target: FilePreviewTarget | null = null;
// The files opened so far, as the browser pane's tabs. Opening a file adds a tab (or brings its tab forward),
// as Claude Desktop's browser does; a published Artifact is not a tab.
let tabs: BrowserTab[] = [];
let nextTabId = 1;
let activeTabId: number | null = null;
let expanded = false;
// The width the reader dragged the pane to, in pixels; null while it has its default width.
let width: number | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function set(next: FilePreviewTarget | null): void {
  target = next;
  if (next === null) {
    expanded = false;
    tabs = [];
    activeTabId = null;
  }
  notify();
}

/** Show the tab as the pane's file. */
function activate(tab: BrowserTab): void {
  activeTabId = tab.id;
  target = { path: tab.path };
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
  getWidth: (): number | null => width,
  /** Remember the width the reader dragged to (null goes back to the default). Kept for the life of the page, across files. */
  setWidth: (next: number | null): void => {
    width = next;
    notify();
  },
  open: (path: string, publishedUrl?: string): void => {
    if (publishedUrl) {
      activeTabId = null;
      set({ path, publishedUrl });
      return;
    }
    const known = tabs.find((tab) => tab.path === path);
    if (known) {
      activate(known);
      return;
    }
    const tab = { id: nextTabId++, path };
    tabs = [...tabs, tab];
    activate(tab);
  },
  /** A tab with no page yet (the browser's "new tab"); its path is empty until an address is typed into it. */
  openBlankTab: (): void => {
    const tab = { id: nextTabId++, path: '' };
    tabs = [...tabs, tab];
    activate(tab);
  },
  /** The dock's browser button: opens the pane on a new tab, or closes it when it is open. */
  toggleBrowser: (): void => {
    if (target !== null) {
      set(null);
      return;
    }
    const tab = { id: nextTabId++, path: '' };
    tabs = [tab];
    activate(tab);
  },
  /** The tabs, in the order they were opened. The same array until they change. */
  getTabs: (): BrowserTab[] => tabs,
  getActiveTabId: (): number | null => activeTabId,
  activateTab: (id: number): void => {
    const tab = tabs.find((candidate) => candidate.id === id);
    if (tab) activate(tab);
  },
  /** Close one tab; the pane shows its neighbour, or closes when it was the last. */
  closeTab: (id: number): void => {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return;
    const rest = tabs.filter((tab) => tab.id !== id);
    if (rest.length === 0) {
      set(null);
      return;
    }
    tabs = rest;
    if (activeTabId === id) activate(rest[Math.min(index, rest.length - 1)]);
    else notify();
  },
  /** Keep only this tab. */
  closeOtherTabs: (id: number): void => {
    const tab = tabs.find((candidate) => candidate.id === id);
    if (!tab) return;
    tabs = [tab];
    activate(tab);
  },
  /** Take the tab to another file, as an address typed into it does. */
  navigateTab: (id: number, path: string): void => {
    const tab = tabs.find((candidate) => candidate.id === id);
    if (!tab) return;
    const moved = { id, path };
    tabs = tabs.map((candidate) => (candidate.id === id ? moved : candidate));
    if (activeTabId === id) activate(moved);
    else notify();
  },
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
