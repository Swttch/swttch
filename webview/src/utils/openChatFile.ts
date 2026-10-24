import { getAdapter } from '@/adapters';
import { filePreviewPaneStore } from './filePreviewPaneStore';

/**
 * The kinds the preview pane shows, which the backend reads (`fileContent.ts`).
 * An IDE editor shows none of them well: a page appears as its source, a PDF or
 * a video not at all.
 */
const PREVIEW_EXTENSIONS = new Set([
  'html', 'htm', 'pdf',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif',
  'mp4', 'm4v', 'mov', 'webm',
]);

/** True when the preview pane shows this file, so a click opens it there. */
export function isPreviewablePath(path: string): boolean {
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 && PREVIEW_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * Open a file path the chat names. A page, picture, PDF or video opens in the
 * preview pane next to the chat, as Desktop's Browser pane does; anything else
 * opens in the IDE's editor as before. The pane carries its own "open in editor",
 * so the editor is one click away for a file that was meant to be edited.
 *
 * A line or column only means something in an editor, so a click that names one
 * goes to the editor whatever the file is.
 */
export function openChatFile(path: string, ...position: [line?: number, column?: number]): Promise<void> {
  const [line, column] = position;
  if (line === undefined && column === undefined && isPreviewablePath(path)) {
    filePreviewPaneStore.open(path);
    return Promise.resolve();
  }
  // Passed on exactly as given: a click that named no column makes the same call it always did.
  return getAdapter().openFile(path, ...position);
}
