/** The message the shim below sends to the pane when the page changes its `localStorage`. */
export const PAGE_STORAGE_MESSAGE = 'ccg-page-storage';

/** The most a page may keep, in characters of keys and values together, as a browser's own limit is a few MB. */
const MAX_CHARS = 2_000_000;

/**
 * What a page has put in `localStorage`, kept by the pane per file, so a page opened again finds what it
 * left. It is memory only: it is gone when the webview is.
 */
const kept = new Map<string, Record<string, string>>();

export function storedFor(path: string): Record<string, string> {
  return kept.get(path) ?? {};
}

function size(values: Record<string, string>): number {
  let total = 0;
  for (const [key, value] of Object.entries(values)) total += key.length + value.length;
  return total;
}

/** Apply one change the page reported. Anything not shaped like a change, or that would pass the limit, is ignored. */
export function applyStorageMessage(path: string, data: unknown): void {
  const message = data as { type?: unknown; op?: unknown; key?: unknown; value?: unknown } | null;
  if (message?.type !== PAGE_STORAGE_MESSAGE) return;
  const current = { ...storedFor(path) };
  if (message.op === 'clear') {
    kept.delete(path);
    return;
  }
  if (typeof message.key !== 'string') return;
  if (message.op === 'remove') delete current[message.key];
  else if (message.op === 'set' && typeof message.value === 'string') current[message.key] = message.value;
  else return;
  if (size(current) > MAX_CHARS) return;
  if (Object.keys(current).length === 0) kept.delete(path);
  else kept.set(path, current);
}

/** @internal test-only. */
export function _resetPageStorage(): void {
  kept.clear();
}

/**
 * A page is drawn in a frame of its own, with no origin: a browser gives such a page no storage
 * and answers every use of it with an error. Claude Desktop's file viewer (for a session whose
 * files are on another machine) keeps a page's `localStorage` and lets it write cookies that are
 * not kept, so the page is handed the same: a `localStorage` that works (and tells the pane what
 * changed), a `sessionStorage` that lasts as long as the page, and a `document.cookie` that reads
 * empty and ignores what it is given, without an error.
 *
 * Giving the frame the webview's own origin instead would hand the page the webview's storage and
 * its connection to the backend; this keeps the page where it is and gives it the behaviour.
 */
function shim(initial: Record<string, string>): string {
  return `<script>(function(){
var send=function(m){try{parent.postMessage(m,'*')}catch(e){}};
function make(data,onChange){
  var t={};
  var api={
    get length(){return Object.keys(data).length},
    key:function(i){var k=Object.keys(data);return i>=0&&i<k.length?k[i]:null},
    getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null},
    setItem:function(k,v){k=String(k);v=String(v);data[k]=v;onChange('set',k,v)},
    removeItem:function(k){k=String(k);delete data[k];onChange('remove',k)},
    clear:function(){for(var k in data)delete data[k];onChange('clear')}
  };
  return new Proxy(t,{
    get:function(_,p){if(p in api)return typeof api[p]==='function'?api[p].bind(api):api[p];if(typeof p==='symbol')return undefined;return api.getItem(p)===null?undefined:api.getItem(p)},
    set:function(_,p,v){api.setItem(p,v);return true},
    deleteProperty:function(_,p){api.removeItem(p);return true},
    has:function(_,p){return p in api||Object.prototype.hasOwnProperty.call(data,p)},
    ownKeys:function(){return Object.keys(data)},
    getOwnPropertyDescriptor:function(_,p){return Object.prototype.hasOwnProperty.call(data,p)?{value:data[p],writable:true,enumerable:true,configurable:true}:undefined}
  });
}
var local=make(${JSON.stringify(initial).replace(/</g, '\\u003c')},function(op,k,v){send({type:'${PAGE_STORAGE_MESSAGE}',op:op,key:k,value:v})});
var session=make({},function(){});
try{Object.defineProperty(window,'localStorage',{configurable:true,get:function(){return local}})}catch(e){}
try{Object.defineProperty(window,'sessionStorage',{configurable:true,get:function(){return session}})}catch(e){}
try{Object.defineProperty(Document.prototype,'cookie',{configurable:true,get:function(){return ''},set:function(){}})}catch(e){}
})()</script>`;
}

/**
 * Put the shim where it runs before the page's own scripts: just inside `<head>`, else inside `<html>`,
 * else after the doctype, else first. (A script before the doctype would put the page in quirks mode.)
 */
export function withStorageShim(html: string, initial: Record<string, string>): string {
  const script = shim(initial);
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + script + html.slice(head.index + head[0].length);
  const root = /<html(\s[^>]*)?>/i.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + script + html.slice(root.index + root[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return html.slice(0, doctype[0].length) + script + html.slice(doctype[0].length);
  return script + html;
}
