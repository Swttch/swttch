import { useSyncExternalStore } from 'react';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { BrowserPane, isBrowsablePath, isWebPath } from './BrowserPane';
import { FilePane } from './FilePane';
import { pageSource } from './pageFrame';

/**
 * What the chat shows beside itself when a file is opened (#593). Claude Desktop has two panes for it, and so
 * has this:
 *
 * - a page in a file on this machine opens in a browser tab of the Browser pane (BrowserPane.tsx);
 * - anything else, a published Artifact, a picture, a PDF, a video, text, or a page in a file on another
 *   machine, goes to the file viewer / Artifact pane (FilePane.tsx).
 *
 * The two share the card, the width and its handle, and the close and expand buttons (PaneShell.tsx), and
 * nothing else: each has its own spec.
 */
export function FilePreviewPane() {
  const target = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.get);
  if (target === null) return null;
  // A new tab and a page on the web are the browser's whatever machine the webview is on; a file's page only on this one.
  if (target.publishedUrl === undefined && (isWebPath(target.path) || target.path === '' || (isBrowsablePath(target.path) && pageSource() === 'local'))) return <BrowserPane />;
  return <FilePane />;
}
