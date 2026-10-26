import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
  PlusIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { getAdapter } from '@/adapters';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import { isMac } from '@/config/environment';
import { basename } from '@/pages/ChatPage/ChatInput/basename';
import { filePreviewPaneStore, type BrowserTab } from '@/utils/filePreviewPaneStore';
import { htmlTitleOf } from '@/utils/htmlTitle';
import { decodeText, loadFileContent } from './loadFileContent';
import { PAGE_BACKGROUND_MESSAGE } from './pageBackground';
import { PAGE_LOCATION_MESSAGE, PAGE_TITLE_MESSAGE, fileOfServedPath, frameDocument, servedInjection } from './pageFrame';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { linkFromMessage } from './pageLinks';
import { addElementToComposer, addImageToComposer, elementToken } from '@/utils/composerElements';
import { DesktopIcon } from './DesktopIcon';
import { PreviewError } from './PreviewError';
import { formatFileSize } from '@/pages/ChatPage/ChatInput/AttachmentPreview/formatFileSize';
import { getBridge } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';
import { useDefaultBrowser } from './useDefaultBrowser';
import { AnnotateLayer } from './AnnotateLayer';
import { BrowserMenu, VIEWPORTS, type ViewportId } from './BrowserMenu';
import { PAGE_SELECT_MESSAGE, PAGE_SNAPSHOT_MESSAGE, elementFromMessage, snapshotFromMessage } from './pageInspect';
import { PaneShell, paneIconButton } from './PaneShell';

/** A file the browser pane opens: a page. */
export const isBrowsablePath = (path: string): boolean => /\.html?$/i.test(path);

/** A page on the web, which the pane draws as it is (the app has no say in what it shows). */
export const isWebPath = (path: string): boolean => /^https?:\/\//i.test(path);

/** The name a web tab carries: its site, without the `www.` and the top-level name. */
function siteLabel(url: string): string {
  try {
    const parts = new URL(url).hostname.replace(/^www\./, '').split('.');
    const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return url;
  }
}

/** The name a web tab carries: its page's own title once read, else its site. */
function webTitleOf(url: string): string {
  try {
    return liveTitles.get(url.split('#')[0]) ?? webTitles.get(new URL(url).origin) ?? siteLabel(url);
  } catch {
    return siteLabel(url);
  }
}

/** The address bar's text for a web page: the site and, past the top, the path. */
function webAddressOf(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === '/' ? '' : u.pathname) + u.search;
  } catch {
    return url;
  }
}

/** Where a typed address with no scheme that names a site goes: `localhost` and a bare IP over http, the rest over https. */
function webAddressFromTyped(text: string): string | undefined {
  if (/\.html?($|[?#])/i.test(text) || /\s/.test(text)) return undefined;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(text)) return `http://${text}`;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(text)) return `https://${text}`;
  return undefined;
}

/** The ports a dev server usually listens on, for "Detect dev servers" on the new tab. */
const DEV_PORTS = [3000, 3001, 4200, 4321, 5173, 5174, 8000, 8080, 8888];

/** The first dev server found answering on this machine, as its address. */
async function detectDevServer(): Promise<string | undefined> {
  // The app's own address is not a dev server to preview.
  const own = Number(window.location.port);
  const answers = await Promise.all(DEV_PORTS.filter((port) => port !== own).map(async (port) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    try {
      await fetch(`http://localhost:${port}/`, { mode: 'no-cors', signal: controller.signal });
      return port;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }));
  const port = answers.find((p) => p !== undefined);
  return port === undefined ? undefined : `http://localhost:${port}/`;
}

interface SiteInfo {
  icon: string | null;
  title: string | null;
  blocksFraming: boolean;
}

const siteInfos = new Map<string, Promise<SiteInfo>>();
/** The names of web pages already read, by site, so a tab carries its page's own name. */
const webTitles = new Map<string, string>();
/** The titles pages on the web have said themselves, by address: they follow the page as it changes them. */
const liveTitles = new Map<string, string>();

/** The icon and name of a site, asked of the backend (which can read the page's own icon link and title), once for each site. */
function siteInfoOf(url: string): Promise<SiteInfo> {
  const key = url.split('#')[0];
  let known = siteInfos.get(key);
  if (!known) {
    known = Promise.resolve(getBridge().request(MessageType.GET_FAVICON, { url }))
      .then((answer) => {
        const a = answer as { icon?: unknown; title?: unknown; blocksFraming?: unknown } | null | undefined;
        const info = { icon: typeof a?.icon === 'string' ? a.icon : null, title: typeof a?.title === 'string' ? a.title : null, blocksFraming: a?.blocksFraming === true };
        if (info.title) {
          try {
            webTitles.set(new URL(url).origin, info.title);
          } catch {
            // Not an address; there is no site to name.
          }
        }
        return info;
      })
      .catch(() => ({ icon: null, title: null, blocksFraming: false }));
    siteInfos.set(key, known);
  }
  return known;
}

/** The little picture in front of a tab's name: the site's own icon for a page on the web, and the globe only where the site has none. */
function TabIcon({ path, onInfo }: { path: string; onInfo?: () => void }) {
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setIcon(null);
    if (isWebPath(path)) void siteInfoOf(path).then((info) => {
      if (!live) return;
      setIcon(info.icon);
      if (info.title) onInfo?.();
    });
    return () => {
      live = false;
    };
  }, [path]);
  if (icon) return <img src={icon} alt="" className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />;
  return <DesktopIcon name="Globe" className="h-3.5 w-3.5 shrink-0 opacity-70" />;
}

/** A tab with no page yet: the browser's new tab. */
const isBlank = (path: string): boolean => path === '';

/** The names of pages already read, by file, so a tab that is not shown still carries its page's own name. */
const pageTitles = new Map<string, string>();

/** @internal test-only. */
export function _resetPageTitles(): void {
  pageTitles.clear();
}

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; html: string }
  | { status: 'failed'; reason: 'unsupported' | 'tooLarge' | 'unreadable'; size?: number; maxBytes?: number };

/** The address as the address bar writes it: a path with forward slashes. */
const addressOf = (path: string): string => path.replace(/\\/g, '/');

/** What a typed address means from the page that is shown: a web address, or a file (a relative one is read from the shown page's folder). */
function resolveAddress(typed: string, from: string): { kind: 'web'; url: string } | { kind: 'file'; path: string } | null {
  const text = typed.trim();
  if (text === '') return null;
  if (/^https?:\/\//i.test(text)) return { kind: 'web', url: text };
  const site = webAddressFromTyped(text);
  if (site) return { kind: 'web', url: site };
  const slashes = addressOf(text);
  if (/^([a-zA-Z]:\/|\/)/.test(slashes)) return { kind: 'file', path: slashes };
  const folder = addressOf(from).replace(/\/[^/]*$/, '');
  const parts = `${folder}/${slashes}`.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.') out.push(part);
  }
  return { kind: 'file', path: out.join('/') };
}

interface History {
  stack: string[];
  index: number;
}

/**
 * Claude Desktop's Browser pane, for a page that sits in a file on this machine: the file opens in a
 * browser tab (the app opens a click on such a file there, one tab for each file), with the tab strip on
 * top, back, forward and reload and the address under it. Written to its own spec, apart from the
 * Artifact pane and the file viewer (FilePane.tsx), with which it shares only the card (PaneShell.tsx).
 *
 * Not here, because they need a browser engine of their own and this page is drawn in a frame: a new
 * blank tab, browsing to other sites (a web address opens in the default browser, after asking), and
 * the page tools (annotate, select an element).
 */
export function BrowserPane() {
  const { t } = useTranslation('chat');
  const allTabs = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.getTabs);
  const activeId = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.getActiveTabId);
  const tabs = useMemo(() => allTabs.filter((tab) => isBrowsablePath(tab.path) || isWebPath(tab.path) || isBlank(tab.path)), [allTabs]);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[tabs.length - 1];
  const path = active?.path;
  const blank = path === '';

  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [frameLoaded, setFrameLoaded] = useState(false);
  // The page as a web page of its own, served by the backend; 'failed' falls back to the page's text in the frame.
  const [served, setServed] = useState<{ status: 'pending' } | { status: 'failed' } | { status: 'ready'; src: string; root: string }>({ status: 'pending' });
  const workingDirectory = useWorkingDirOrNull()?.workingDirectory;
  const [reloads, setReloads] = useState(0);
  const [pageBackground, setPageBackground] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [, setTitlesRead] = useState(0);
  const [tabMenu, setTabMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const lastModified = useRef<number | undefined>(undefined);
  const [viewport, setViewport] = useState<ViewportId>('responsive');
  const [autoCheck, setAutoCheck] = useState(false);
  // The annotation bar, and pointing at an element (which the bar shows as its first tool). Pointing from the address bar
  // brings the bar up with it and puts it away again once an element is picked.
  const [annotating, setAnnotating] = useState(false);
  const barForPick = useRef(false);
  const histories = useRef(new Map<number, History>());

  useEffect(() => {
    if (path === undefined || path === '' || isWebPath(path)) return;
    let cancelled = false;
    setState({ status: 'loading' });
    setServed({ status: 'pending' });
    setFrameLoaded(false);
    setPageBackground(null);

    // The page at an address of its own, so its neighbours load, its links go to the files they name and
    // its storage is its own; the backend puts the pane's scripts into it.
    void Promise.resolve(getBridge().request(MessageType.GET_PAGE_URL, { path, workingDir: workingDirectory, inject: servedInjection() }))
      .then((answer) => {
        if (cancelled) return;
        const a = answer as { port?: unknown; pathname?: unknown; root?: unknown } | null | undefined;
        if (typeof a?.port !== 'number' || typeof a.pathname !== 'string' || typeof a.root !== 'string') return setServed({ status: 'failed' });
        // A different name than the app's own, so cookies are not shared with it.
        const host = window.location.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
        setServed({ status: 'ready', src: `http://${host}:${a.port}${a.pathname}`, root: a.root });
      })
      .catch(() => !cancelled && setServed({ status: 'failed' }));

    void loadFileContent(path, () => cancelled).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ status: 'failed', reason: result.reason === 'tooLarge' ? 'tooLarge' : result.reason === 'unsupported' ? 'unsupported' : 'unreadable', size: result.size, maxBytes: result.maxBytes });
        return;
      }
      lastModified.current = result.modifiedAt;
      if (result.kind !== 'html') {
        setState({ status: 'failed', reason: 'unsupported' });
        return;
      }
      const html = decodeText(result.pieces);
      const title = htmlTitleOf(html);
      if (title !== undefined) {
        pageTitles.set(path, title);
        setTitlesRead((count) => count + 1);
      }
      setState({ status: 'ready', html });
    });
    return () => {
      cancelled = true;
    };
  }, [path, reloads]);

  // The page reports the colour it paints, so the card can be painted in it; a link or form out of it asks where to open.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const data = e.data as { type?: unknown; color?: unknown; pathname?: unknown; title?: unknown } | null;
      if (data?.type === PAGE_BACKGROUND_MESSAGE && typeof data.color === 'string') setPageBackground(data.color);
      else if (data?.type === PAGE_LOCATION_MESSAGE) onLocation.current(data);
      else if (data?.type === PAGE_TITLE_MESSAGE && typeof data.title === 'string') onTitle.current(data.title);
      else {
        const link = linkFromMessage(data);
        const element = elementFromMessage(data);
        const snapshot = snapshotFromMessage(data);
        if (snapshot !== undefined) snapshotWaiters.current.get(snapshot.id)?.(snapshot.png);
        else if (link !== undefined) setPendingLink(link);
        else if (element !== undefined) {
          // The element becomes a chip in the message box, as in Desktop; its markup goes with the message.
          addElementToComposer(elementToken(element.tag, element.name), element);
          setSelecting(false);
          if (barForPick.current) {
            barForPick.current = false;
            setAnnotating(false);
          }
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [t]);

  // A page on the web that says its own title (a page of this app, or one written for it) keeps its tab's name current.
  const onTitle = useRef((_: string) => undefined as void);
  onTitle.current = (title) => {
    if (path === undefined || !isWebPath(path) || title.trim() === '') return;
    liveTitles.set(path.split('#')[0], title.trim());
    setTitlesRead((count) => count + 1);
  };

  // A served page tells where it is: a link to another file in it moves the tab to that file.
  const onLocation = useRef((_: { pathname?: unknown; title?: unknown }) => undefined as void);
  onLocation.current = (data) => {
    if (served.status !== 'ready' || typeof data.pathname !== 'string' || path === undefined || !active) return;
    const file = fileOfServedPath(served.root, data.pathname);
    if (typeof data.title === 'string' && data.title !== '') {
      pageTitles.set(file ?? path, data.title);
      setTitlesRead((count) => count + 1);
    }
    if (file !== undefined && file !== path && isBrowsablePath(file)) go({ kind: 'file', path: file });
  };

  // "Check for changes automatically": the page is read again while the file is being written, and shown again when it changed.
  useEffect(() => {
    if (!autoCheck || path === undefined || path === '' || isWebPath(path)) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void loadFileContent(path, () => cancelled).then((result) => {
        if (cancelled || !result.ok) return;
        if (lastModified.current !== undefined && result.modifiedAt !== undefined && result.modifiedAt !== lastModified.current) setReloads((count) => count + 1);
      });
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [autoCheck, path]);

  // A page on the web has its frame at once; it counts as shown when the frame says it has loaded.
  useEffect(() => {
    if (path !== undefined && isWebPath(path)) {
      setFrameLoaded(false);
      setPageBackground(null);
    }
  }, [path, reloads]);

  useEffect(() => {
    setFramingBlocked(false);
    if (path === undefined || !isWebPath(path)) return;
    let live = true;
    void siteInfoOf(path).then((info) => live && setFramingBlocked(info.blocksFraming));
    return () => {
      live = false;
    };
  }, [path]);

  // Selecting an element asks the page to outline what is under the pointer and report a click.
  const [selecting, setSelecting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  // Whether a page on the web forbids being shown in a frame, as the site's own headers say.
  const [framingBlocked, setFramingBlocked] = useState(false);
  const defaultBrowser = useDefaultBrowser();
  const snapshotWaiters = useRef(new Map<string, (png: string | null) => void>());
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: PAGE_SELECT_MESSAGE, on: selecting }, '*');
  }, [selecting, frameLoaded]);

  // The page as it is shown, as a PNG data URL, or null when the page could not be drawn.
  const requestSnapshot = () =>
    new Promise<string | null>((resolve) => {
      const id = `${Date.now()}-${Math.random()}`;
      const finish = (png: string | null) => {
        snapshotWaiters.current.delete(id);
        resolve(png);
      };
      snapshotWaiters.current.set(id, finish);
      setTimeout(() => snapshotWaiters.current.get(id)?.(null), 3000);
      frameRef.current?.contentWindow?.postMessage({ type: PAGE_SNAPSHOT_MESSAGE, id }, '*');
    });

  // "Add to chat" on the annotate bar: the page as it is shown, with the marks drawn over it, goes in as a picture.
  const addAnnotationToChat = async (marks: HTMLCanvasElement) => {
    const png = await requestSnapshot();
    const out = document.createElement('canvas');
    out.width = marks.width;
    out.height = marks.height;
    const ctx = out.getContext('2d')!;
    if (png) {
      const image = new Image();
      await new Promise<void>((done) => {
        image.onload = () => done();
        image.onerror = () => done();
        image.src = png;
      });
      if (image.naturalWidth > 0) ctx.drawImage(image, 0, 0, out.width, out.height);
    }
    ctx.drawImage(marks, 0, 0);
    out.toBlob((blob) => blob && addImageToComposer(blob, 'annotated-page.png'));
  };

  // "Save screenshot" on the menu: the page as it is shown, saved as a picture. Downloaded from a blob address,
  // not the data address itself: a download of a long data address fails silently in some browsers.
  const saveScreenshot = async () => {
    const png = await requestSnapshot();
    if (!png) throw new Error('no snapshot');
    const fileName = `${(web && path ? siteLabel(path) : basename(path ?? '') || 'page').replace(/\.[^.]+$/, '')}.png`;
    // The host's own save dialog first: the IDE's embedded browser carries no download out of the page at all.
    try {
      const answer = (await getBridge().request(MessageType.SAVE_IMAGE, { suggestedName: fileName, base64: png.slice(png.indexOf(',') + 1) }, { timeout: null })) as { path?: string | null; error?: string } | null;
      if (answer?.path) {
        toast.success(t('filePreview.menu.screenshotSaved', { path: answer.path }));
        return;
      }
      if (answer && answer.path === null && !answer.error) return; // They cancelled the dialog.
    } catch {
      // The host could not ask; the browser's own download is next.
    }
    const blob = await (await fetch(png)).blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on a timer: revoking while the browser is still reading the blob cancels the save.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    toast.success(t('filePreview.menu.screenshotDownloaded'));
  };

  const html = state.status === 'ready' ? state.html : undefined;
  const pageDocument = useMemo(() => (html === undefined ? undefined : frameDocument(html, 'local', {})), [html, reloads]);

  // The tab's own history: where it has been since it was opened, for back and forward.
  const historyOf = (tab: BrowserTab): History => {
    let history = histories.current.get(tab.id);
    if (!history) {
      history = { stack: [tab.path], index: 0 };
      histories.current.set(tab.id, history);
    }
    return history;
  };
  const history = active ? historyOf(active) : undefined;
  const canGoBack = history !== undefined && history.index > 0;
  const canGoForward = history !== undefined && history.index < history.stack.length - 1;

  const go = (to: { kind: 'web'; url: string } | { kind: 'file'; path: string } | null) => {
    if (to === null || !active) return;
    if (to.kind === 'web') {
      const entry = historyOf(active);
      entry.stack = [...entry.stack.slice(0, entry.index + 1), to.url];
      entry.index = entry.stack.length - 1;
      filePreviewPaneStore.navigateTab(active.id, to.url);
      return;
    }
    if (!isBrowsablePath(to.path)) {
      filePreviewPaneStore.open(to.path);
      return;
    }
    const entry = historyOf(active);
    entry.stack = [...entry.stack.slice(0, entry.index + 1), to.path];
    entry.index = entry.stack.length - 1;
    filePreviewPaneStore.navigateTab(active.id, to.path);
  };
  const step = (by: -1 | 1) => {
    if (!active) return;
    const entry = historyOf(active);
    const next = entry.index + by;
    if (next < 0 || next >= entry.stack.length) return;
    entry.index = next;
    filePreviewPaneStore.navigateTab(active.id, entry.stack[next]);
  };

  // The address bar: the shown page's address until the reader types in it.
  const address = path === undefined ? '' : isWebPath(path) ? webAddressOf(path) : addressOf(path);
  const [draft, setDraft] = useState<string | null>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDraft(null);
    // A new tab starts at its address.
    if (blank) addressRef.current?.focus();
  }, [path, blank]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const modifier = isMac() ? e.metaKey : e.ctrlKey;
      if (!modifier || e.altKey || e.shiftKey) return;
      // The browser's own keys, as Claude Desktop's pane answers them: the address, back and forward.
      if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        addressRef.current?.focus();
        addressRef.current?.select();
      } else if (e.key === '[') {
        e.preventDefault();
        step(-1);
      } else if (e.key === ']') {
        e.preventDefault();
        step(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    if (tabMenu === null) return;
    const close = () => setTabMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [tabMenu]);

  if (!active || path === undefined) return null;

  const web = isWebPath(path);
  const name = blank ? t('filePreview.newTab') : web ? siteLabel(path) : basename(path);
  const labelOf = (tab: BrowserTab): string => (isBlank(tab.path) ? t('filePreview.newTab') : isWebPath(tab.path) ? webTitleOf(tab.path) : pageTitles.get(tab.path) ?? basename(tab.path).replace(/\.[^.]+$/, ''));
  // The card is painted in the page's colour so no seam of another colour shows at its rounded edge; the
  // top row and the address bar keep the theme's own colour, as Claude Desktop's do.
  const cardStyle: CSSProperties | undefined = pageBackground ? { backgroundColor: pageBackground } : undefined;
  const reload = () => setReloads((count) => count + 1);
  const viewportSize = (() => {
    const v = VIEWPORTS.find((candidate) => candidate.id === viewport);
    return v && 'width' in v ? { width: v.width, height: v.height } : undefined;
  })();
  const navButton = `${paneIconButton} disabled:!opacity-30 disabled:hover:bg-transparent`;

  return (
    <PaneShell
      label={t('filePreview.label', { name })}
      cardStyle={cardStyle}
      header={
        <div className="flex min-w-0 items-center gap-0.5">
          <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <div role="tablist" aria-label={t('filePreview.tabs')} className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {tabs.map((tab) => {
              const selected = tab.id === active.id;
              return (
                <div
                  key={tab.id}
                  role="tab"
                  aria-selected={selected}
                  tabIndex={0}
                  onClick={() => filePreviewPaneStore.activateTab(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') filePreviewPaneStore.activateTab(tab.id);
                  }}
                  // A middle click closes the tab, as in a browser; a right click offers to close the others.
                  onAuxClick={(e) => {
                    if (e.button === 1) filePreviewPaneStore.closeTab(tab.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTabMenu({ id: tab.id, x: e.clientX, y: e.clientY });
                  }}
                  className={`group flex h-[calc(27px/var(--ui-zoom,1))] min-w-0 max-w-[calc(180px/var(--ui-zoom,1))] shrink cursor-default items-center gap-1.5 rounded-lg ps-[calc(8px/var(--ui-zoom,1))] pe-0.5 text-[0.8461rem] ${
                    selected ? 'bg-[color-mix(in_srgb,currentColor_12%,transparent)]' : 'opacity-70 hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)] hover:opacity-100'
                  }`}
                >
                  <TabIcon path={tab.path} onInfo={() => setTitlesRead((count) => count + 1)} />
                  <span dir="auto" className="min-w-0 flex-1 truncate">{labelOf(tab)}</span>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={t('filePreview.closeTab')}
                    onClick={(e) => {
                      e.stopPropagation();
                      filePreviewPaneStore.closeTab(tab.id);
                    }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-70 hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] hover:opacity-100"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <Tooltip desktop content={t('filePreview.newTab')} shortcut={isMac() ? '⌘T' : 'Ctrl+T'} placement="bottom">
            <button type="button" aria-label={t('filePreview.newTab')} className={paneIconButton} onClick={() => filePreviewPaneStore.openBlankTab()}>
              <PlusIcon className="h-4 w-4" />
            </button>
          </Tooltip>
          </div>
          <BrowserMenu
            path={path}
            address={address}
            viewport={viewport}
            onViewport={setViewport}
            autoCheck={autoCheck}
            onAutoCheck={setAutoCheck}
            onSaveScreenshot={saveScreenshot}
            screenshotDisabled={blank || web}
            annotating={annotating}
            onToggleAnnotate={() => {
              setSelecting(false);
              barForPick.current = false;
              setAnnotating((value) => !value);
            }}
            annotateDisabled={blank || (!web && state.status !== 'ready')}
            onOpenFile={(picked) => go({ kind: 'file', path: addressOf(picked) })}
          />
        </div>
      }
      toolbar={
        <div className="flex shrink-0 items-center gap-0.5 bg-surface-raised px-[calc(8px/var(--ui-zoom,1))] pb-[calc(6px/var(--ui-zoom,1))] text-text-primary" dir="ltr">
          <button type="button" disabled={!canGoBack} aria-label={t('filePreview.back')} className={navButton} onClick={() => step(-1)}>
            <DesktopIcon name="ArrowLeft" className="h-4 w-4" />
          </button>
          <button type="button" disabled={!canGoForward} aria-label={t('filePreview.forward')} className={navButton} onClick={() => step(1)}>
            <DesktopIcon name="ArrowRight" className="h-4 w-4" />
          </button>
          <button type="button" disabled={blank} aria-label={t('filePreview.reload')} className={navButton} onClick={reload}>
            <DesktopIcon name="ArrowClockwise" className="h-4 w-4" />
          </button>
          <div className="mx-1 flex h-7 min-w-0 flex-1 items-center rounded-lg bg-[color-mix(in_srgb,currentColor_8%,transparent)] ps-3 pe-0.5 text-[0.8461rem]">
            <input
              ref={addressRef}
              type="text"
              spellCheck={false}
              aria-label={t('filePreview.address')}
              placeholder={t('filePreview.addressPlaceholder')}
              value={draft ?? address}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => setDraft(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  go(resolveAddress(e.currentTarget.value, path));
                  setDraft(null);
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  // Escape leaves the address first; the pane closes only on an Escape pressed with nothing being edited.
                  if (draft !== null) {
                    e.stopPropagation();
                    setDraft(null);
                    e.currentTarget.blur();
                  }
                }
              }}
              className="min-w-0 flex-1 truncate bg-transparent outline-none"
            />
          </div>
          <Tooltip desktop content={t('filePreview.selectElement')} placement="bottom">
            <button
              type="button"
              aria-label={t('filePreview.selectElement')}
              aria-pressed={selecting}
              disabled={blank || web || state.status !== 'ready'}
              className={`${navButton} ${selecting ? '!opacity-100 bg-[color-mix(in_srgb,currentColor_12%,transparent)]' : ''}`}
              onClick={() => {
                if (selecting) {
                  setSelecting(false);
                  if (barForPick.current) {
                    barForPick.current = false;
                    setAnnotating(false);
                  }
                  return;
                }
                setSelecting(true);
                if (!annotating) {
                  barForPick.current = true;
                  setAnnotating(true);
                }
              }}
            >
              <DesktopIcon name={selecting ? 'CursorFilled' : 'Cursor'} className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      }
      outside={
        <>
          {tabMenu !== null && (
            <div
              role="menu"
              className="fixed z-50 w-48 rounded-xl border border-border-default bg-surface-overlay p-1.5 text-text-primary shadow-lg"
              style={{ left: tabMenu.x, top: tabMenu.y }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {[
                { label: t('filePreview.closeTab'), run: () => filePreviewPaneStore.closeTab(tabMenu.id), disabled: false },
                { label: t('filePreview.closeOthers'), run: () => filePreviewPaneStore.closeOtherTabs(tabMenu.id), disabled: tabs.length < 2 },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setTabMenu(null);
                    item.run();
                  }}
                  className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-start text-[0.8461rem] enabled:hover:bg-[var(--surface-selected)] disabled:opacity-40"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {pendingLink !== null && (
            <ConfirmDialog
              title={t('filePreview.linkTitle')}
              message={t('filePreview.linkMessage', { url: pendingLink, browser: defaultBrowser ?? t('filePreview.menu.browserFallback') })}
              confirmLabel={t('filePreview.linkOpen')}
              onCancel={() => setPendingLink(null)}
              onConfirm={() => {
                const url = pendingLink;
                setPendingLink(null);
                getAdapter().openUrl(url).catch(() => undefined);
              }}
            />
          )}
        </>
      }
    >
      {blank && (
        // The new tab's page, as Claude Desktop's: a globe, what the browser is for, and a way to find a dev server.
        <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface-raised px-8 text-center">
          <DesktopIcon name="Globe" className="mb-2 h-6 w-6 opacity-50" />
          <p className="text-[0.8461rem] font-medium">{t('filePreview.blankTitle')}</p>
          <p className="max-w-[22rem] text-[0.7692rem] leading-[1.5] text-text-tertiary">{t('filePreview.blankBody')}</p>
          <p className="mt-4 flex items-center gap-1.5 text-[0.7692rem] text-text-tertiary">
            <span>{t('filePreview.blankDevServerPrompt')}</span>
            <button
              type="button"
              disabled={detecting}
              className="rounded-md px-1.5 py-0.5 text-text-secondary hover:bg-[color-mix(in_srgb,currentColor_10%,transparent)] hover:text-text-primary disabled:opacity-50"
              onClick={() => {
                setDetecting(true);
                void detectDevServer().then((url) => {
                  setDetecting(false);
                  if (url) go({ kind: 'web', url });
                  else toast.error(t('filePreview.blankDevServerNone'));
                });
              }}
            >
              {t('filePreview.blankDevServerAction')}
            </button>
          </p>
        </div>
      )}
      {!blank && web && (
        <div className="absolute inset-0 flex flex-col">
          <div role="note" className="flex shrink-0 items-center gap-2 bg-[#4a3512] px-3 py-1.5 text-[0.7692rem] text-[#f1b44c]">
            <DesktopIcon name="Warning" className="h-4 w-4 shrink-0" />
            <span>{t('filePreview.webUnsupported')}</span>
          </div>
          <div className="relative min-h-0 flex-1">
            {!frameLoaded && (
              <div role="status" aria-label={t('filePreview.loading')} className="absolute inset-0 flex items-center justify-center">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-border-default border-t-text-secondary" />
              </div>
            )}
            {framingBlocked && (
              <div className="absolute inset-0 z-10 bg-surface-raised">
                <PreviewError
                  title={t('filePreview.webBlocked.title')}
                  detail={t('filePreview.webBlocked.detail')}
                  action={{
                    label: t('filePreview.webBlocked.open', { browser: defaultBrowser ?? t('filePreview.menu.browserFallback') }),
                    onClick: () => void getAdapter().openUrl(path),
                  }}
                />
              </div>
            )}
            <iframe
              ref={frameRef}
              key={`${path}:${reloads}`}
              title={name}
              src={path}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              referrerPolicy="no-referrer"
              onLoad={() => setFrameLoaded(true)}
              className="absolute inset-0 h-full w-full border-0 bg-white"
            />
          </div>
        </div>
      )}
      {/* Until the content is in place a spinner stands where it will be, so the pane never shows an empty white sheet. */}
      {!blank && !web && (state.status === 'loading' || (state.status === 'ready' && (served.status === 'pending' || !frameLoaded))) && (
        <div role="status" aria-label={t('filePreview.loading')} className="absolute inset-0 flex items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-border-default border-t-text-secondary" />
        </div>
      )}
      {!blank && !web && state.status === 'failed' && (
        <PreviewError
          title={t(state.reason === 'unsupported' ? 'filePreview.error.titleUnsupported' : state.reason === 'tooLarge' ? 'filePreview.error.titleTooLarge' : 'filePreview.error.title')}
          detail={state.reason === 'unsupported'
            ? t('filePreview.unsupported')
            : state.reason === 'tooLarge'
              ? t('filePreview.tooLarge', { size: formatFileSize(state.size ?? 0), limit: formatFileSize(state.maxBytes ?? 0) })
              : t('filePreview.error.deleted')}
          path={path}
          action={{ label: t('filePreview.error.back'), onClick: () => (canGoBack ? step(-1) : filePreviewPaneStore.navigateTab(active.id, '')) }}
        />
      )}
      {!blank && !web && state.status === 'ready' && served.status !== 'pending' && (
        // Cut a pixel into the clipping box on every side: a frame on a fractional edge would otherwise let
        // its white backing show as a hairline along the card's right and bottom border. At a device's size the
        // page keeps that size, on a darker ground, and scrolls when the pane is smaller.
        <div className={`absolute inset-0 ${viewportSize ? 'overflow-auto bg-[#2a2a2a]' : 'overflow-hidden'}`}>
          <div className={viewportSize ? 'relative mx-auto shrink-0 overflow-hidden bg-white' : 'contents'} style={viewportSize ? { width: viewportSize.width, height: viewportSize.height } : undefined}>
            <iframe
              ref={frameRef}
              title={name}
              sandbox={served.status === 'ready' ? 'allow-scripts allow-same-origin allow-forms allow-popups' : 'allow-scripts allow-forms allow-popups'}
              key={reloads}
              {...(served.status === 'ready' ? { src: served.src } : { srcDoc: pageDocument })}
              onLoad={() => setFrameLoaded(true)}
              className={viewportSize ? `h-full w-full border-0 bg-white ${frameLoaded ? '' : 'invisible'}` : `absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] border-0 bg-white ${frameLoaded ? '' : 'invisible'}`}
            />
          </div>
        </div>
      )}
      {annotating && !blank && (web || state.status === 'ready') && <AnnotateLayer
          picking={selecting}
          onTogglePick={() => setSelecting((value) => !value)}
          onAddToChat={addAnnotationToChat}
          onClose={() => {
            barForPick.current = false;
            setSelecting(false);
            setAnnotating(false);
          }}
        />}
    </PaneShell>
  );
}
