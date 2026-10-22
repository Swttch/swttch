import toast from 'react-hot-toast';
import { getAdapter } from '@/adapters';
import { i18n } from '@/i18n';
import { isJetBrains } from '@/config/environment';
import { linkMenuStore } from './linkMenuStore';

/** Schemes the IDE's browser should open; anything else is left to the page. */
const ROUTED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * The link under the event that would take the page somewhere else: an anchor
 * whose target is not this page's own origin. In-page anchors and links to our
 * own localhost UI are not external.
 */
function findExternalUrl(event: MouseEvent): string | null {
  const element = event.target instanceof Element ? event.target : null;
  const anchor = element?.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return null;
  }
  if (!ROUTED_PROTOCOLS.has(url.protocol)) return null;
  if (url.origin === window.location.origin) return null;
  return anchor.href;
}

function route(event: MouseEvent): void {
  // A link that already handled its own click (the markdown renderer's) is done.
  if (event.defaultPrevented) return;
  // `click` is the primary button; a middle click arrives as `auxclick` with
  // button 1. The right button stays with the context menu.
  if (event.type === 'auxclick' && event.button !== 1) return;
  // Outside the IDE the browser opens the link itself.
  if (!isJetBrains()) return;
  const url = findExternalUrl(event);
  if (!url) return;
  event.preventDefault();
  getAdapter()
    .openUrl(url)
    .catch((err) => {
      console.error('[externalLinkRouting] Failed to open external link:', err);
      toast.error(i18n.t('chat:externalLink.openFailed'));
    });
}

/**
 * A right click on an external link. The browser's own menu has no entry for the
 * link's address (it offers Back, Print and View page source), so the page shows
 * its own: open in the browser, copy the address.
 */
function routeContextMenu(event: MouseEvent): void {
  if (event.defaultPrevented) return;
  if (!isJetBrains()) return;
  const url = findExternalUrl(event);
  if (!url) return;
  event.preventDefault();
  linkMenuStore.open({ target: { kind: 'external', url }, x: event.clientX, y: event.clientY });
}

/**
 * Sends every external link in the page to the IDE's browser. In the IDE the
 * chat tab is a single embedded browser: a link that is left to the browser's
 * own handling either asks for a popup that the IDE does not reliably pass on
 * (a plain click) or never asks for one at all (a middle click), and the tab
 * itself then navigates to the page. Listening once at the document covers
 * every anchor, including ones rendered by libraries and ones added later.
 * A right click on one of them opens the link menu instead of the browser's.
 * Returns the function that removes the listeners.
 */
export function installExternalLinkRouting(target: Document = document): () => void {
  target.addEventListener('click', route);
  target.addEventListener('auxclick', route);
  target.addEventListener('contextmenu', routeContextMenu);
  return () => {
    target.removeEventListener('click', route);
    target.removeEventListener('auxclick', route);
    target.removeEventListener('contextmenu', routeContextMenu);
  };
}
