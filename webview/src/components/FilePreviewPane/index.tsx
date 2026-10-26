import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from '@/i18n';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { formatFileSize } from '@/pages/ChatPage/ChatInput/AttachmentPreview/formatFileSize';
import { basename } from '@/pages/ChatPage/ChatInput/basename';
import { htmlTitleOf } from '@/utils/htmlTitle';
import { Tooltip } from '@/components/Tooltip';
import { PaneMenu } from './PaneMenu';
import { ArtifactMenu } from './ArtifactMenu';
import { TextView } from './TextView';
import { PAGE_BACKGROUND_MESSAGE, withBackgroundProbe } from './pageBackground';
import { MIN_PANE_WIDTH, maxPaneWidth, useIsWide, usePaneWidth } from './usePaneColumn';
import { CodeBracketIcon, EyeIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { isMac } from '@/config/environment';
import { ExpandIcon, FoldIcon } from './PaneIcons';
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
/** The keys that close the pane, as the close button's tooltip writes them. */
const CLOSE_SHORTCUT_LABEL = (): string => (isMac() ? '⌘\\' : 'Ctrl+\\');

export function FilePreviewPane() {
  const target = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.get);
  const path = target?.path;
  const { t } = useTranslation('chat');
  const expanded = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.isExpanded);
  const wide = useIsWide();
  const paneWidth = usePaneWidth(wide);
  const [state, setState] = useState<PaneState>({ status: 'loading' });
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [pageBackground, setPageBackground] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const drag = useRef<{ startX: number; startWidth: number; scale: number } | null>(null);
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
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (path === undefined) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') filePreviewPaneStore.close();
      // ⌘\ (Ctrl+\ elsewhere), the shortcut Claude Desktop's pane names on its close button.
      if (e.key === '\\' && (isMac() ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        filePreviewPaneStore.close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [path]);

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
  const iconButton = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] hover:opacity-100';

  return (
    <>
    <aside
      ref={asideRef}
      role="complementary"
      aria-label={t('filePreview.label', { name })}
      // A rounded card set in from the window's edge, as Claude Desktop's is, rather than a slab against it.
      className="fixed bottom-2 end-2 top-2 z-40 flex flex-col overflow-hidden rounded-[calc(12px/var(--ui-zoom,1))] border border-border-default bg-surface-raised text-text-primary shadow-lg"
      // Beside the chat it takes its own column; in a window too narrow for two columns it floats over the chat, and expanded it covers it.
      // The card is painted in the page's colour too, so the bar and the page are one surface.
      style={{ width: expanded ? 'calc(100% - 1rem)' : paneWidth, ...barStyle }}
    >
      {/* As thick as Claude Desktop's header (33px) and as close to the card's edges (3px), whatever the UI zoom: screen pixels, divided by it to land on the page's own. */}
      <header className="flex h-[calc(33px/var(--ui-zoom,1))] shrink-0 items-center gap-0.5 bg-surface-raised px-[calc(3px/var(--ui-zoom,1))] text-text-primary">
        <div className="min-w-0 flex-1">
          {publishedUrl !== undefined ? (
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
          )}
        </div>
        <Tooltip desktop content={expanded ? t('filePreview.collapse') : t('filePreview.expand')} placement="bottom">
          <button type="button" aria-label={expanded ? t('filePreview.collapse') : t('filePreview.expand')} className={iconButton}
            onClick={() => filePreviewPaneStore.toggleExpanded()}>
            {expanded ? <FoldIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
          </button>
        </Tooltip>
        <Tooltip desktop content={t('filePreview.close')} shortcut={CLOSE_SHORTCUT_LABEL()} placement="bottom">
          <button type="button" aria-label={t('filePreview.close')} className={iconButton}
            onClick={() => filePreviewPaneStore.close()}>
            <XMarkIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      </header>

      {/* Where the file is, and the way to its source when it has one, as Claude Desktop's file viewer has.
          A published Artifact has neither there: it is the page and nothing around it. */}
      {publishedUrl === undefined && (
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
      )}

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto">
        {/* Until the content is in place a spinner stands where it will be, so the pane never shows an empty white sheet. */}
        {(state.status === 'loading' || (state.status === 'ready' && state.kind === 'html' && !frameLoaded && !showSource)) && (
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

        {showSource && sourceText !== undefined && <TextView text={sourceText} />}
        {!showSource && state.status === 'ready' && state.kind === 'html' && (
          // Cut a pixel into the clipping box on every side: a frame on a fractional edge would otherwise let
          // its white backing show as a hairline along the card's right and bottom border.
          <div className="absolute inset-0 overflow-hidden">
            <iframe
              ref={frameRef}
              title={name}
              sandbox="allow-scripts allow-forms allow-popups"
              srcDoc={withBackgroundProbe(state.html)}
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
      </div>
    </aside>
    {!expanded && (
      // Claude Desktop's handle: no line along the card, only a short pill in the gutter beside it, drawn while the pointer is on the
      // grip or dragging. It sits outside the card (which clips what is inside it), so it is a sibling placed from the card's own width.
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('filePreview.resize')}
        className="group/resize fixed bottom-2 top-2 z-40 w-[calc(20px/var(--ui-zoom,1))] cursor-col-resize touch-none"
        style={{ right: `calc(0.5rem + ${paneWidth} - 4px / var(--ui-zoom, 1))` }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          // Measured from where the drag began, in screen pixels: the pointer reports them, and the
          // stored width is kept in them too, so it does not change with the UI zoom.
          const aside = asideRef.current;
          const startWidth = aside?.offsetWidth ?? 0;
          const scale = aside && startWidth > 0 ? aside.getBoundingClientRect().width / startWidth : 1;
          drag.current = { startX: e.clientX, startWidth, scale: scale > 0 ? scale : 1 };
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const next = start.startWidth * start.scale + (start.startX - e.clientX);
          const max = maxPaneWidth(window.innerWidth, wide);
          filePreviewPaneStore.setWidth(Math.round(Math.min(max, Math.max(MIN_PANE_WIDTH, next))));
        }}
        onPointerUp={(e) => {
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onDoubleClick={() => filePreviewPaneStore.setWidth(null)}
      >
        <div className="absolute start-1/2 top-1/2 h-[calc(42px/var(--ui-zoom,1))] w-[calc(3px/var(--ui-zoom,1))] -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent transition-colors group-hover/resize:bg-text-primary/35 group-active/resize:bg-text-primary/50" />
      </div>
    )}
    </>
  );
}

/** The path as a trail of folders, the last few of them: `/ private / tmp / demo / page.html`, or `… / tmp / demo / page.html` when it is long. */
function breadcrumb(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '');
  const shown = parts.length > 4 ? ['…', ...parts.slice(-4)] : parts;
  return `${path.startsWith('/') && parts.length <= 4 ? '/ ' : ''}${shown.join(' / ')}`;
}
