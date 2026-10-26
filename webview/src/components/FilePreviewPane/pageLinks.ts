/** The message the guard below sends to the pane when the page tries to leave through a link or a form. */
export const PAGE_LINK_MESSAGE = 'ccg-page-link';

/** The address a page asked to go to, when it is one the pane may offer to open; else undefined. */
export function linkFromMessage(data: unknown): string | undefined {
  const message = data as { type?: unknown; url?: unknown } | null;
  if (message?.type !== PAGE_LINK_MESSAGE || typeof message.url !== 'string') return undefined;
  try {
    const url = new URL(message.url);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * In Claude Desktop, a page that sits in a file on the machine the app runs on is opened in the
 * app's own browser tab, and a link out of it, a form sent to another site and a link that opens a
 * new tab all stop at one question, "where should the link open?", instead of just going. (Measured
 * in the Windows app: `target=_blank` and a form's send button each raised the dialog; a `#anchor`
 * link scrolled the page without one.)
 *
 * The page is handed a guard that catches those two doors, tells the pane the address, and leaves
 * the question to the pane. Anchors inside the page, and anything that is not an http(s) address,
 * are left alone.
 */
const GUARD = `<script>(function(){
function ask(url){try{parent.postMessage({type:'${PAGE_LINK_MESSAGE}',url:url},'*')}catch(e){}}
// The attribute as written, not the resolved address: a page in a srcdoc frame resolves "#bottom" and
// "other.html" against the webview's own address, which would make every anchor look like a web link.
function written(v){return /^\\s*(https?:)?\\/\\//i.test(v||'')}
document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
  if(!a||!written(a.getAttribute('href')))return;
  var u;try{u=new URL(a.href)}catch(x){return}
  e.preventDefault();ask(u.toString());
},true);
document.addEventListener('submit',function(e){
  var f=e.target;if(!f||!f.getAttribute||!written(f.getAttribute('action')))return;
  var u;try{u=new URL(f.action)}catch(x){return}
  e.preventDefault();
  if(String(f.method).toLowerCase()!=='post'){try{new FormData(f).forEach(function(v,k){if(typeof v==='string')u.searchParams.set(k,v)})}catch(x){}}
  ask(u.toString());
},true);
})()</script>`;

export function withLinkGuard(html: string): string {
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + GUARD + html.slice(head.index + head[0].length);
  const root = /<html(\s[^>]*)?>/i.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + GUARD + html.slice(root.index + root[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return html.slice(0, doctype[0].length) + GUARD + html.slice(doctype[0].length);
  return GUARD + html;
}
