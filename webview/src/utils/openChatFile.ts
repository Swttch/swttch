import toast from 'react-hot-toast';
import { getAdapter } from '@/adapters';
import { i18n } from '@/i18n';
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

/**
 * Text a file Claude handed over is read as, in the pane, as code: Desktop's file
 * viewer shows these. A path named in the chat is not opened this way, since a
 * source file there is meant for the editor.
 */
const SENT_TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'xml', 'log', 'ini',
  'py', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'css', 'sh', 'sql', 'mmd', 'rb', 'go', 'rs', 'java', 'kt',
]);

/** True when a file Claude handed over opens in the pane: what a path click shows there, and text as code. */
export function isSentFileViewable(path: string): boolean {
  if (isPreviewablePath(path)) return true;
  const name = path.split(/[\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 && SENT_TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * Open a file Claude handed over: in the pane when it can be shown there, else
 * the way any path in the chat opens.
 */
export function openSentFile(path: string): Promise<void> {
  if (isSentFileViewable(path)) {
    filePreviewPaneStore.open(path);
    return Promise.resolve();
  }
  // What the pane cannot show is handed to another app, which opens beside this window: say so, or the click reads as
  // having done nothing.
  const name = path.split(/[\\/]/).pop() ?? path;
  return openChatFile(path).then(() => {
    toast.success(i18n.t('chat:sentFiles.opened', { name }));
  });
}

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
