import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from '@/i18n';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { formatFileSize } from '@/pages/ChatPage/ChatInput/AttachmentPreview/formatFileSize';
import { basename } from '@/pages/ChatPage/ChatInput/basename';
import { htmlTitleOf } from '@/utils/htmlTitle';
import { Tooltip } from '@/components/Tooltip';
import { PaneMenu } from './PaneMenu';
import { PANE_COLUMN_WIDTH, useIsWide } from './usePaneColumn';
import {
  ArrowsPointingInIcon, ArrowsPointingOutIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { decodeText, loadFileContent, type FileContentKind } from './loadFileContent';

type PaneState =
  | { status: 'loading' }
  | { status: 'ready'; kind: Exclude<FileContentKind, 'html'>; url: string }
  | { status: 'ready'; kind: 'html'; html: string }
  | { status: 'failed'; reason: 'unsupported' | 'tooLarge' | 'unreadable' | 'unplayable'; size?: number; maxBytes?: number };

/**
 * A page, picture, PDF or video the chat named, shown in a pane on the end side
 * of the chat (#593). Desktop shows the same kinds in its Browser pane when a
 * file path in the chat is clicked.
 *
 * A page is drawn in a sandboxed frame that is given its text and nothing else:
 * its scripts run, but with no access to this page, and files it refers to by
 * relative path are not found, since the frame has no folder to look them up in.
 * A page written to stand alone is shown as it is.
 *
 * Whether a PDF is drawn, or a video plays, depends on the browser engine the
 * webview runs in. The one in the IDE has no H.264 decoder, so a typical .mp4
 * fails there with "no supported streams" (measured on 2024.2.6 on a Mac); the
 * pane then says so, and the header offers the system's own viewer beside the editor.
 */
export function FilePreviewPane() {
  const target = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.get);
  const path = target?.path;
  const { t } = useTranslation('chat');
  const expanded = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.isExpanded);
  const wide = useIsWide();
  const column = wide && !expanded;
  const [state, setState] = useState<PaneState>({ status: 'loading' });
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (path === undefined) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    setState({ status: 'loading' });
    setFrameLoaded(false);

    void loadFileContent(path, () => cancelled).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ status: 'failed', reason: result.reason, size: result.size, maxBytes: result.maxBytes });
        return;
      }
      if (result.kind === 'html') {
        setState({ status: 'ready', kind: 'html', html: decodeText(result.pieces) });
        return;
      }
      objectUrl = URL.createObjectURL(result.blob);
      setState({ status: 'ready', kind: result.kind, url: objectUrl });
    });

    return () => {
      cancelled = true;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [path, reloads]);

  useEffect(() => {
    if (path === undefined) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') filePreviewPaneStore.close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [path]);

  if (path === undefined) return null;

  const name = basename(path);
  // A page is named by its own <title>, as Desktop's pane names it, else by its file.
  const heading = state.status === 'ready' && state.kind === 'html' ? (htmlTitleOf(state.html) ?? name) : name;
  const publishedUrl = target?.publishedUrl;
  const iconButton = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary';

  return (
    <aside
      role="complementary"
      aria-label={t('filePreview.label', { name })}
      // A rounded card set in from the window's edge, as Claude Desktop's is, rather than a slab against it.
      className="fixed bottom-2 end-2 top-2 z-40 flex flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-raised shadow-lg"
      // Beside the chat it takes its own column; expanded, or in a window too narrow for two columns, it covers the chat.
      style={{ width: column ? PANE_COLUMN_WIDTH : 'calc(100% - 1rem)', maxWidth: column || expanded ? undefined : 720 }}
    >
      <header className="flex shrink-0 items-center gap-0.5 border-b border-border-subtle px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <PaneMenu
            heading={heading}
            path={path}
            name={name}
            source={state.status === 'ready' && state.kind === 'html' ? state.html : undefined}
            publishedUrl={publishedUrl}
            onReload={() => setReloads((count) => count + 1)}
          />
        </div>
        <Tooltip content={expanded ? t('filePreview.collapse') : t('filePreview.expand')} placement="bottom">
          <button type="button" aria-label={expanded ? t('filePreview.collapse') : t('filePreview.expand')} className={iconButton}
            onClick={() => filePreviewPaneStore.toggleExpanded()}>
            {expanded ? <ArrowsPointingInIcon className="h-4 w-4" /> : <ArrowsPointingOutIcon className="h-4 w-4" />}
          </button>
        </Tooltip>
        <Tooltip content={t('filePreview.close')} placement="bottom">
          <button type="button" aria-label={t('filePreview.close')} className={iconButton}
            onClick={() => filePreviewPaneStore.close()}>
            <XMarkIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto">
        {/* Until the content is in place a spinner stands where it will be, so the pane never shows an empty white sheet. */}
        {(state.status === 'loading' || (state.status === 'ready' && state.kind === 'html' && !frameLoaded)) && (
          <div role="status" aria-label={t('filePreview.loading')} className="absolute inset-0 flex items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-border-default border-t-text-secondary" />
          </div>
        )}

        {state.status === 'failed' && (
          <p className="px-6 text-center text-[0.8461rem] text-text-secondary">
            {state.reason === 'tooLarge'
              ? t('filePreview.tooLarge', {
                  size: formatFileSize(state.size ?? 0),
                  limit: formatFileSize(state.maxBytes ?? 0),
                })
              : state.reason === 'unsupported'
                ? t('filePreview.unsupported')
                : state.reason === 'unplayable'
                  ? t('filePreview.unplayable')
                  : t('filePreview.unreadable')}
          </p>
        )}

        {state.status === 'ready' && state.kind === 'html' && (
          <iframe
            title={name}
            sandbox="allow-scripts allow-forms allow-popups"
            srcDoc={state.html}
            onLoad={() => setFrameLoaded(true)}
            className={`h-full w-full border-0 bg-white ${frameLoaded ? '' : 'invisible'}`}
          />
        )}
        {state.status === 'ready' && state.kind === 'pdf' && (
          <iframe title={name} src={state.url} className="h-full w-full border-0" />
        )}
        {state.status === 'ready' && state.kind === 'image' && (
          <img src={state.url} alt={name} className="max-h-full max-w-full object-contain" />
        )}
        {state.status === 'ready' && state.kind === 'video' && (
          <video
            src={state.url}
            controls
            className="max-h-full max-w-full"
            onError={() => setState({ status: 'failed', reason: 'unplayable' })}
          />
        )}
      </div>
    </aside>
  );
}
