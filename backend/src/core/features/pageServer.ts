import { randomBytes } from 'crypto';
import { createReadStream, readFile, realpathSync, statSync } from 'fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'path';

/**
 * Serves the files of a page the Browser pane shows as a real web page, from an address of their own (#593).
 *
 * Claude Desktop opens a page in a file on this machine in a browser tab: the page has an address, so its
 * stylesheets and pictures beside it load, its links to other files go there, and its cookies and
 * `localStorage` are its own. A frame fed the page's text (`srcdoc`) has none of that. This serves the
 * files over a loopback address on a port of its own, which makes the page an origin the app's own origin
 * can not be confused with, and the pane points its frame at that address.
 *
 * Every address carries a random token the pane was given when it asked for the page, so a page of the
 * web or another program on the machine cannot read files by guessing paths. Only files under the token's
 * root are served (the project folder when the file is in it, else the file's own folder), and nothing
 * whose name starts with a dot (`.env`, `.git`).
 */
interface Root {
  dir: string;
  /** The markup put right after the page's `<head>`: what the pane needs inside the page. */
  inject: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf', '.wasm': 'application/wasm',
};

const roots = new Map<string, Root>();
let server: Server | undefined;
let listening: Promise<number> | undefined;

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Where `urlPath` (the part after the token) points under `root`, or undefined when it must not be served. */
export function resolveServedFile(root: string, urlPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0')) return undefined;
  const segments = decoded.split(/[\\/]/).filter((s) => s !== '');
  if (segments.some((s) => s.startsWith('.'))) return undefined;
  const target = resolve(root, ...segments);
  if (!isInside(root, target)) return undefined;
  try {
    // A link inside the folder that points out of it is not a way out.
    return isInside(realpathSync(root), realpathSync(target)) ? target : undefined;
  } catch {
    return undefined;
  }
}

/** The page's own text with `inject` after its `<head>`. */
export function injectIntoHtml(html: string, inject: string): string {
  if (!inject) return html;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + inject + html.slice(head.index + head[0].length);
  const root = /<html(\s[^>]*)?>/i.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + inject + html.slice(root.index + root[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return html.slice(0, doctype[0].length) + inject + html.slice(doctype[0].length);
  return inject + html;
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const fail = (status: number) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(status === 404 ? 'Not found' : 'Forbidden');
  };
  // A request whose Host is not this machine's own name is a DNS-rebinding attempt.
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') return fail(403);
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(403);
  const match = /^\/p\/([0-9a-f]{48})(\/[^?#]*)?/.exec(req.url ?? '');
  const root = match ? roots.get(match[1]) : undefined;
  if (!match || !root) return fail(404);
  const file = resolveServedFile(root.dir, match[2] ?? '/');
  if (!file) return fail(404);
  let size: number;
  try {
    const info = statSync(file);
    if (!info.isFile()) return fail(404);
    size = info.size;
  } catch {
    return fail(404);
  }
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (type.startsWith('text/html')) {
    readFile(file, 'utf8', (error, html) => {
      if (error) return fail(404);
      const body = injectIntoHtml(html, root.inject);
      res.writeHead(200, { ...headers, 'Content-Length': Buffer.byteLength(body) });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

function listen(): Promise<number> {
  listening ??= new Promise<number>((resolvePort, reject) => {
    server = createServer(handle);
    server.on('error', (error) => {
      listening = undefined;
      reject(error);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      resolvePort(typeof address === 'object' && address ? address.port : 0);
    });
  });
  return listening;
}

export interface ServedPage {
  port: number;
  /** The path (starting with `/p/`) of the page on that port, with its file name encoded. */
  pathname: string;
  /** The folder the address is rooted at; a path under it is a file the page's links can reach. */
  root: string;
}

/** The address a file's page is served at. */
export async function servePage(filePath: string, projectDir: string | undefined, inject: string): Promise<ServedPage> {
  const port = await listen();
  const file = resolve(filePath);
  const project = projectDir ? resolve(projectDir) : undefined;
  const dir = project && isInside(project, file) ? project : dirname(file);
  let token = [...roots.entries()].find(([, r]) => r.dir === dir && r.inject === inject)?.[0];
  if (!token) {
    token = randomBytes(24).toString('hex');
    roots.set(token, { dir, inject });
  }
  const rel = relative(dir, file).split(sep).map(encodeURIComponent).join('/') || encodeURIComponent(basename(file));
  return { port, pathname: `/p/${token}/${rel}`, root: dir };
}

export function stopPageServer(): void {
  server?.close();
  server = undefined;
  listening = undefined;
  roots.clear();
}
