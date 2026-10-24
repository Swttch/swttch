import { useEffect, useState, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import { getAdapter } from '@/adapters';
import { i18n, useTranslation } from '@/i18n';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { formatFileSize } from '@/pages/ChatPage/ChatInput/AttachmentPreview/formatFileSize';
import { basename } from '@/pages/ChatPage/ChatInput/basename';
import { decodeText, loadFileContent, type FileContentKind } from './loadFileContent';

type PaneState =
  | { status: 'loading' }
  | { status: 'ready'; kind: Exclude<FileContentKind, 'html'>; url: string }
  | { status: 'ready'; kind: 'html'; html: string }
  | { status: 'failed'; reason: 'unsupported' | 'tooLarge' | 'unreadable' | 'unplayable'; size?: number; maxBytes?: number };

function failed(err: unknown, path: string) {
  console.error('[FilePreviewPane] Failed to open file:', err);
  toast.error(i18n.t('chat:fileOpenFailed', { path }));
}

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
  const [state, setState] = useState<PaneState>({ status: 'loading' });

  useEffect(() => {
    if (path === undefined) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    setState({ status: 'loading' });

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
  }, [path]);

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

  return (
    <aside
      role="complementary"
      aria-label={t('filePreview.label', { name })}
      className="fixed inset-y-0 end-0 z-40 flex w-full max-w-[720px] flex-col border-s border-border-default bg-surface-raised shadow-xl"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-border-default px-3 py-2">
        <span dir="ltr" className="min-w-0 flex-1 truncate text-[0.9231rem] font-medium text-text-primary">{name}</span>
        <button
          type="button"
          className="shrink-0 rounded px-2 py-1 text-[0.8461rem] text-text-secondary hover:bg-surface-hover"
          onClick={() => getAdapter().openFile(path).catch((err) => failed(err, path))}
        >
          {t('filePreview.openInEditor')}
        </button>
        <button
          type="button"
          className="shrink-0 rounded px-2 py-1 text-[0.8461rem] text-text-secondary hover:bg-surface-hover"
          onClick={() => getAdapter().openFileWithSystemApp(path).catch((err) => failed(err, path))}
        >
          {t('filePreview.openWithSystemApp')}
        </button>
        <button
          type="button"
          aria-label={t('filePreview.close')}
          className="shrink-0 rounded px-2 py-1 text-text-secondary hover:bg-surface-hover"
          onClick={() => filePreviewPaneStore.close()}
        >
          ✕
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
        {state.status === 'loading' && <p className="text-[0.8461rem] text-text-tertiary">{t('filePreview.loading')}</p>}

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
            className="h-full w-full border-0 bg-white"
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
