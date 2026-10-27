import { isLoopbackHostname } from '@/api/bridge/authToken';
import { withBackgroundProbe } from './pageBackground';
import { withImagePolicy } from './pagePolicy';
import { withInspector } from './pageInspect';
import { withLinkGuard } from './pageLinks';
import { withStorageShim } from './pageStorage';

/**
 * Where the page's file lives, as the app Claude Desktop draws it:
 *
 * - `local`: on the machine the webview is opened on. Desktop opens such a file in its own browser
 *   tab as a plain web page (external pictures show, storage is refused, a link or form out of it
 *   asks where to open).
 * - `remote`: on another machine (a tunnel, a remote browser). Desktop then draws the file with its
 *   own file viewer: external pictures are blocked, `localStorage` works and cookies are ignored.
 *
 * A webview served from a loopback address is on the machine of the files.
 */
export type PageSource = 'local' | 'remote';

export function pageSource(hostname: string = typeof window === 'undefined' ? 'localhost' : window.location.hostname): PageSource {
  return isLoopbackHostname(hostname) ? 'local' : 'remote';
}

/** The text handed to the page's frame. */
export function frameDocument(html: string, source: PageSource, stored: Record<string, string>): string {
  const page = source === 'remote' ? withStorageShim(withImagePolicy(html), stored) : withInspector(withLinkGuard(html));
  return withBackgroundProbe(page);
}

/** The message the served page sends the pane when it is at a new address or has a new title. */
export const PAGE_LOCATION_MESSAGE = 'ccg-page-location';

const LOCATION = `<script>(function(){function s(){try{parent.postMessage({type:'${PAGE_LOCATION_MESSAGE}',pathname:location.pathname,title:document.title},'*')}catch(e){}}addEventListener('load',s);addEventListener('hashchange',s);addEventListener('popstate',s);try{new MutationObserver(s).observe(document.head||document.documentElement,{childList:true,subtree:true,characterData:true})}catch(e){}})()</script>`;

/**
 * What the pane has the backend put in the head of a page it serves as a web page of its own: the same
 * guard, element inspector and background probe `frameDocument` gives a page in a frame, and a report of
 * the page's address, so a link to another file in the page moves the tab there.
 */
export function servedInjection(): string {
  const doc = frameDocument('<head></head>', 'local', {});
  return doc.slice('<head>'.length).replace('</head>', '') + LOCATION;
}

/** The file a served page's address stands for: the root the address is under, and the path below it. */
export function fileOfServedPath(root: string, pathname: string): string | undefined {
  const match = /^\/p\/[0-9a-f]{48}\/(.*)$/.exec(pathname);
  if (!match) return undefined;
  let rel: string;
  try {
    rel = decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/, '')}${separator}${rel.split('/').join(separator)}`;
}

/** The message a page that knows it is shown in the Browser pane sends when its title changes. */
export const PAGE_TITLE_MESSAGE = 'ccg-page-title';

/**
 * A page of this app shown inside another page's frame (the Browser pane's tab) reports its title as it
 * changes. A frame cannot read the title of a page of another site, so a page that wants its tab to carry
 * its title has to say it. Returns the function that stops the reporting.
 */
export function reportTitleToParent(): () => void {
  if (typeof window === 'undefined' || window.parent === window) return () => undefined;
  const send = () => window.parent.postMessage({ type: PAGE_TITLE_MESSAGE, title: document.title }, '*');
  send();
  const observer = new MutationObserver(send);
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
