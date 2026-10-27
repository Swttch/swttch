import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from '@/i18n';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { formatFileSize } from '@/pages/ChatPage/ChatInput/AttachmentPreview/formatFileSize';
import { basename } from '@/pages/ChatPage/ChatInput/basename';
import { htmlTitleOf } from '@/utils/htmlTitle';
import { Tooltip } from '@/components/Tooltip';
import { CodeBracketIcon, EyeIcon } from '@heroicons/react/24/outline';
import { PaneMenu } from './PaneMenu';
import { ArtifactMenu } from './ArtifactMenu';
import { TextView } from './TextView';
import { PAGE_BACKGROUND_MESSAGE, withBackgroundProbe } from './pageBackground';
import { frameDocument } from './pageFrame';
import { PreviewError } from './PreviewError';
import { applyStorageMessage, storedFor } from './pageStorage';
import { PaneShell, paneIconButton } from './PaneShell';
import { decodeText, loadFileContent, type FileContentKind } from './loadFileContent';

type PaneState =
  | { status: 'loading' }
  // `source` is the file's own text when it has one a reader can look at: a picture drawn from SVG.
  | { status: 'ready'; kind: Exclude<FileContentKind, 'html' | 'text'>; url: string; source?: string }
  | { status: 'ready'; kind: 'text'; text: string }
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
/**
 * The pane for what is not a page in a file on this machine: a published Artifact, a picture, a PDF, a video,
 * text, and a page in a file on another machine (Claude Desktop's file viewer). A page in a file on this machine
 * is the browser pane's (BrowserPane.tsx), a pane with a spec of its own.
 */
export function FilePane() {
  const target = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.get);
  const path = target?.path;
  const { t } = useTranslation('chat');
  const [state, setState] = useState<PaneState>({ status: 'loading' });
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [pageBackground, setPageBackground] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [reloads, setReloads] = useState(0);
  const [modifiedAt, setModifiedAt] = useState<number | undefined>(undefined);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    if (path === undefined) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    setState({ status: 'loading' });
    setFrameLoaded(false);
    setPageBackground(null);
    setShowSource(false);

    void loadFileContent(path, () => cancelled).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ status: 'failed', reason: result.reason, size: result.size, maxBytes: result.maxBytes });
        return;
      }
      setModifiedAt(result.modifiedAt);
      if (result.kind === 'text') {
        setState({ status: 'ready', kind: 'text', text: decodeText(result.pieces) });
        return;
      }
      if (result.kind === 'html') {
        // A page opened as a file shows its source first, as Claude Desktop's file viewer does; a page
        // that was published as an Artifact shows the page.
        setShowSource(filePreviewPaneStore.get()?.publishedUrl === undefined);
        setState({ status: 'ready', kind: 'html', html: decodeText(result.pieces) });
        return;
      }
      objectUrl = URL.createObjectURL(result.blob);
      setState({
        status: 'ready', kind: result.kind, url: objectUrl,
        ...(result.mimeType === 'image/svg+xml' ? { source: decodeText(result.pieces) } : {}),
      });
    });

    return () => {
      cancelled = true;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [path, reloads]);

  // The page reports the colour it paints, so the card can be painted in it (see pageBackground.ts).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const data = e.data as { type?: unknown; color?: unknown } | null;
      if (data?.type === PAGE_BACKGROUND_MESSAGE && typeof data.color === 'string') setPageBackground(data.color);
      // What the page keeps in its localStorage is kept here, per file (see pageStorage.ts).
      else if (path !== undefined) applyStorageMessage(path, data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [path]);

  // Built once per load: a srcDoc that changed while the page wrote to its storage would reload the page.
  const html = state.status === 'ready' && state.kind === 'html' ? state.html : undefined;
  const pageDocument = useMemo(
    () =>
      html === undefined || path === undefined
        ? undefined
        : // A published Artifact keeps its page whole; a page opened as a file on another machine is drawn as Claude Desktop's file viewer draws it.
          filePreviewPaneStore.get()?.publishedUrl !== undefined
          ? withBackgroundProbe(html)
          : frameDocument(html, 'remote', storedFor(path)),
    [html, path, reloads],
  );

  if (path === undefined) return null;

  const name = basename(path);
  // A page is named by its own <title>, as Desktop's pane names it, else by its file.
  // A page that names itself nothing is called by its file, without the extension, as its card in the chat is.
  const heading = state.status === 'ready' && state.kind === 'html' ? (htmlTitleOf(state.html) ?? name.replace(/\.[^.]+$/, '')) : name;
  const publishedUrl = target?.publishedUrl;
  // The card is painted in the page's colour so no seam of another colour shows at its rounded edge; the
  // header keeps the theme's own colour (below), as Claude Desktop's does.
  const barStyle = pageBackground ? { backgroundColor: pageBackground } : undefined;
  // The text a reader can look at instead of the drawn file: a page's own HTML, an SVG's markup.
  const sourceText = state.status === 'ready' ? (state.kind === 'html' ? state.html : state.kind === 'image' ? state.source : undefined) : undefined;
  const iconButton = paneIconButton;

  return (
    <PaneShell
      label={t('filePreview.label', { name })}
      cardStyle={barStyle}
      header={
        publishedUrl !== undefined ? (
          // A published page has the menu Claude Desktop's artifact pane has; any other file, the file menu.
          <ArtifactMenu
            heading={heading}
            path={path}
            name={name}
            source={state.status === 'ready' && state.kind === 'html' ? state.html : undefined}
            publishedUrl={publishedUrl}
            onReload={() => setReloads((count) => count + 1)}
          />
        ) : (
          <PaneMenu
            heading={heading}
            path={path}
            name={name}
            source={state.status === 'ready' ? (state.kind === 'html' ? state.html : state.kind === 'text' ? state.text : undefined) : undefined}
            publishedUrl={publishedUrl}
            modifiedAt={modifiedAt}
            onReload={() => setReloads((count) => count + 1)}
          />
        )
      }
      // Where the file is, and the way to its source when it has one, as Claude Desktop's file viewer has.
      // A published Artifact has neither there: it is the page and nothing around it.
      toolbar={
        publishedUrl === undefined ? (
          <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-[0.75rem] opacity-70" dir="ltr">
            <span className="min-w-0 flex-1 truncate" title="">{breadcrumb(path)}</span>
            {sourceText !== undefined && (
              <Tooltip desktop content={showSource ? t('filePreview.showRendered') : t('filePreview.showSource')} placement="bottom">
                <button type="button" aria-pressed={showSource} aria-label={showSource ? t('filePreview.showRendered') : t('filePreview.showSource')}
                  className={iconButton} onClick={() => setShowSource((value) => !value)}>
                  {showSource ? <EyeIcon className="h-4 w-4" /> : <CodeBracketIcon className="h-4 w-4" />}
                </button>
              </Tooltip>
            )}
          </div>
        ) : undefined
      }
    >
        {/* Until the content is in place a spinner stands where it will be, so the pane never shows an empty white sheet. */}
        {(state.status === 'loading' || (state.status === 'ready' && state.kind === 'html' && !frameLoaded && !showSource)) && (
          <div role="status" aria-label={t('filePreview.loading')} className="absolute inset-0 flex items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-border-default border-t-text-secondary" />
          </div>
        )}

        {state.status === 'failed' && (
          <PreviewError
            title={t(state.reason === 'unsupported' || state.reason === 'unplayable' ? 'filePreview.error.titleUnsupported' : state.reason === 'tooLarge' ? 'filePreview.error.titleTooLarge' : 'filePreview.error.title')}
            detail={state.reason === 'tooLarge'
              ? t('filePreview.tooLarge', { size: formatFileSize(state.size ?? 0), limit: formatFileSize(state.maxBytes ?? 0) })
              : state.reason === 'unsupported'
                ? t('filePreview.unsupported')
                : state.reason === 'unplayable'
                  ? t('filePreview.unplayable')
                  : t('filePreview.error.deleted')}
            path={path}
          />
        )}

        {showSource && sourceText !== undefined && <TextView text={sourceText} />}
        {!showSource && state.status === 'ready' && state.kind === 'html' && (
          // Cut a pixel into the clipping box on every side: a frame on a fractional edge would otherwise let
          // its white backing show as a hairline along the card's right and bottom border.
          <div className="absolute inset-0 overflow-hidden">
            <iframe
              ref={frameRef}
              title={name}
              sandbox="allow-scripts allow-forms allow-popups"
              srcDoc={pageDocument}
              onLoad={() => setFrameLoaded(true)}
              className={`absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] border-0 bg-white ${frameLoaded ? '' : 'invisible'}`}
            />
          </div>
        )}
        {state.status === 'ready' && state.kind === 'text' && <TextView text={state.text} />}
        {state.status === 'ready' && state.kind === 'pdf' && (
          <iframe title={name} src={state.url} className="h-full w-full border-0" />
        )}
        {!showSource && state.status === 'ready' && state.kind === 'image' && (
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
    </PaneShell>
  );
}

/** The path as a trail of folders, the last few of them: `/ private / tmp / demo / page.html`, or `… / tmp / demo / page.html` when it is long. */
function breadcrumb(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '');
  const shown = parts.length > 4 ? ['…', ...parts.slice(-4)] : parts;
  return `${path.startsWith('/') && parts.length <= 4 ? '/ ' : ''}${shown.join(' / ')}`;
}
