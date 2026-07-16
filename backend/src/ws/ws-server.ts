import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import { join, extname, resolve, sep } from 'path';
import { timingSafeEqual } from 'crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { authToken } from '../config/environment';
import { ConnectionManager } from './connection-manager';
import { handleEditorContextRequest } from './editor-context-route';
import { handleIdeSelectionRequest } from './ide-selection-route';
import { handleStatusRequest } from './status-route';
import type { Bridge } from '../bridge/bridge-interface';
import type { IPCMessage } from '../core/types';
import { ClientEnv, MessageType } from '../shared';
import { isJetBrainsMode } from '../config/environment';
import { getPluginVersion } from '../core/handlers/getVersion';
import { cancelLogin } from '../core/handlers/login';
import { reportBackendError, trackActivity } from '../core/features/telemetry';
import { tunnelPairing } from '../core/features/tunnel-pairing';
import { LogWebSocketServer } from '../logging/log-ws';

const ALLOWED_WS_ORIGINS = new Set([
  'http://localhost',
  'http://127.0.0.1',
  'https://localhost',
  'https://127.0.0.1',
]);

const ALLOWED_TUNNEL_SUFFIXES = [
  '.trycloudflare.com',
];

/** Origins that are implicitly safe (no origin header, or JCEF file:// loads) */
function isImplicitlyAllowedOrigin(origin: string | undefined): boolean {
  // No Origin header — e.g. same-origin requests, non-browser clients
  if (!origin) return true;
  // JCEF may set origin to the literal string "null" (file:// or data: origins)
  if (origin === 'null') return true;
  // file:// protocol — JCEF local page loads
  if (origin.startsWith('file://')) return true;
  return false;
}

/** Bind hosts that keep the backend on the local machine only. */
const LOOPBACK_BIND_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '']);

/** True when the server is bound to a non-loopback address (e.g. `ccg run -b 0.0.0.0`). */
export function isNonLoopbackBind(host: string | undefined): boolean {
  return !LOOPBACK_BIND_HOSTS.has(host ?? '');
}

/**
 * Origin 검증 — /ws, /logs 공통.
 *
 * `allowSameOrigin`은 운영자가 명시적으로 비-loopback 바인딩(`ccg run -b <addr>`)을
 * 선택했을 때만 true다. 그 경우 Origin의 host가 요청이 도착한 Host 헤더와 정확히
 * 일치하면(strict same-origin) 허용한다 — LAN의 다른 기기가 `http://<이 머신 IP>:19836`
 * 로 접속하는 실사용 경로를 열어준다. 기본 loopback 바인딩에서는 이 완화가 꺼져 있어
 * DNS-rebinding(공격자 도메인이 우리 host로 리바인딩되는 경우)이 여전히 차단된다.
 */
export function validateOrigin(
  origin: string | undefined,
  requestHost?: string,
  allowSameOrigin = false,
): boolean {
  if (isImplicitlyAllowedOrigin(origin)) return true;
  try {
    const url = new URL(origin!);
    const normalized = `${url.protocol}//${url.hostname}`;
    if (ALLOWED_WS_ORIGINS.has(normalized)) return true;
    if (ALLOWED_TUNNEL_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))) return true;
    // Strict same-origin: url.host includes the port (hostname:port), matched
    // against the exact Host header the upgrade request arrived on.
    if (allowSameOrigin && requestHost && url.host === requestHost) return true;
    return false;
  } catch {
    return false;
  }
}

// ── 제어 채널 토큰 인증 ─────────────────────────────────────
// RFC 6455 WebSocket에는 내장 인증이 없다. 브라우저 WebSocket이 handshake에 붙일
// 수 있는 유일한 헤더인 Sec-WebSocket-Protocol(서브프로토콜)에 토큰을 실어 보낸다.
// 클라이언트는 `new WebSocket(url, ['ccg-auth', token])`로 접속하므로 헤더는
// `ccg-auth, <token>` 형태의 콤마 구분 목록이 된다. 쿼리스트링(`?token=`)은
// 로그·히스토리·Referer로 유출될 수 있어 채택하지 않는다(표준 하드닝).
export const AUTH_SUBPROTOCOL = 'ccg-auth';

// /internal/* HTTP POST 푸시(에디터 컨텍스트/셀렉션)는 loopback 전용이나 방어심화로
// 동일 토큰을 요구한다. 커스텀 헤더를 쓴다 — Claude 자체 인증(Authorization)과
// 혼동을 피하고, 프록시가 Authorization을 건드릴 여지를 없애기 위해서다.
//
// IMPORTANT: this header carries the AUTH/bearer token (the per-launch auth
// token), NOT a CSRF token. It is a secret credential that authenticates the
// caller — treat it as such (never log it, compare it constant-time). Do not
// mistake it for a CSRF/double-submit cookie token or handle it more loosely.
export const HTTP_AUTH_HEADER = 'x-ccg-token';

// POST /pair 의 페어링 코드 전달 헤더(대안: JSON 바디 { code }). 원격 기기는 아직
// 토큰이 없으므로(닭-달걀) 이 엔드포인트는 토큰 없이 접근 가능하며, 페어링 코드
// 자체가 자격증명이다. 헤더 이름은 node가 소문자로 정규화한다.
export const PAIR_CODE_HEADER = 'x-ccg-pair-code';

/** Constant-time token compare that never throws on length mismatch. */
function timingSafeTokenEqual(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on differing lengths — guard first. The early length
  // check is not itself constant-time, but token length is not secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Extract the auth token from a Sec-WebSocket-Protocol header value.
 *
 * The header is a comma-separated list; a valid request pairs the `ccg-auth`
 * marker with the secret token, e.g. `"ccg-auth, <token>"`. Returns the token
 * paired with the marker, or undefined when the marker or token is absent.
 */
export function extractAuthToken(protocolHeader: string | undefined): string | undefined {
  if (!protocolHeader) return undefined;
  const parts = protocolHeader
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.includes(AUTH_SUBPROTOCOL)) return undefined;
  const token = parts.find((p) => p !== AUTH_SUBPROTOCOL);
  return token || undefined;
}

/**
 * Validate the token carried in a Sec-WebSocket-Protocol header against the
 * expected per-launch token, using a constant-time comparison.
 */
export function validateAuthToken(
  protocolHeader: string | undefined,
  expected: string,
): boolean {
  return timingSafeTokenEqual(extractAuthToken(protocolHeader), expected);
}

/**
 * handleProtocols for the ws WebSocketServers: always negotiate back the
 * `ccg-auth` marker (never the secret token), so the browser's
 * WebSocket.protocol resolves cleanly and the token is never reflected in the
 * handshake response. The token itself was already validated in the upgrade
 * handler before handleUpgrade runs.
 */
export function selectAuthSubprotocol(protocols: Set<string>): string | false {
  return protocols.has(AUTH_SUBPROTOCOL) ? AUTH_SUBPROTOCOL : false;
}

export type BridgeMap = Record<ClientEnv, Bridge>;

export type MessageHandler = (
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
  bridges: BridgeMap,
) => Promise<void> | void;

interface WebSocketServerHandle {
  connections: ConnectionManager;
  close: () => void;
  port: number;
  logWs?: LogWebSocketServer;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

/** Collect a request body into a string, capped to guard against unbounded input. */
const MAX_REQUEST_BODY_BYTES = 64 * 1024;

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_REQUEST_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStaticFile(
  webviewDir: string,
  urlPath: string,
  res: ServerResponse,
): Promise<void> {
  // Strip querystring and hash before resolving the file path
  const cleanUrl = (urlPath ?? '/').split('?')[0].split('#')[0];
  const normalized = cleanUrl === '/' || !cleanUrl ? 'index.html' : cleanUrl.replace(/^\//, '');
  const filePath = resolve(webviewDir, normalized);

  // Prevent path traversal — resolved path must stay within webviewDir
  const resolvedWebviewDir = resolve(webviewDir);
  if (!filePath.startsWith(resolvedWebviewDir + sep) && filePath !== resolvedWebviewDir) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Hashed bundle assets are content-addressed and safe to cache forever.
  // Anything else (index.html, SPA fallback) must revalidate so a plugin update
  // never leaves JCEF pinned to a stale bundle.
  const isHashedAsset = normalized.startsWith('assets/');
  const cacheControl = isHashedAsset
    ? 'public, max-age=31536000, immutable'
    : 'no-cache, must-revalidate';

  try {
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
    });
    res.end(data);
  } catch {
    // Only fall back to index.html for SPA navigation routes (no file extension)
    const ext = extname(normalized).toLowerCase();
    if (ext && ext !== '.html') {
      // Static asset not found → 404 (never serve index.html as JS/CSS)
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    // SPA route fallback
    try {
      const indexData = await readFile(join(webviewDir, 'index.html'));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
      });
      res.end(indexData);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
}

export function startWebSocketServer(
  port: number,
  host: string,
  bridges: BridgeMap,
  handleMessage: MessageHandler,
  webviewDir?: string,
  logWs?: LogWebSocketServer,
): Promise<WebSocketServerHandle> {
  return new Promise<WebSocketServerHandle>((resolve, reject) => {
    // Standalone backends boot with the keep-alive gate up, so the
    // idle-shutdown timer is never armed: the operator owns the process
    // lifetime (visible terminal, Ctrl+C → graceful shutdown). Nothing lowers
    // the gate in that mode — SET_KEEP_ALIVE only ever arrives from Kotlin,
    // and the parent watchdog is JetBrains-only. SESSION_CLEANUP is untouched.
    const connections = new ConnectionManager(!isJetBrainsMode);
    // Only relax Origin validation to strict same-origin when the operator
    // explicitly bound to a non-loopback address. Default loopback bind keeps
    // the historical allowlist-only behavior (DNS-rebinding stays closed).
    const allowSameOrigin = isNonLoopbackBind(host);

    // wss와 connections는 한 번만 생성. handleProtocols는 협상되는 서브프로토콜을
    // 항상 `ccg-auth` 마커로 고정한다 — 클라이언트가 순서를 바꿔 보내더라도 비밀
    // 토큰이 handshake 응답에 반영되지 않도록 방어한다.
    const wss = new WebSocketServer({ noServer: true, handleProtocols: selectAuthSubprotocol });
    const rpcWss = new WebSocketServer({ noServer: true, handleProtocols: selectAuthSubprotocol });

    // WebSocket 연결 핸들러 — 한 번만 등록
    wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      // Parse client environment + optional panelId from query: /ws?env=jetbrains&panelId=...
      const params = new URL(request.url ?? '/ws', 'http://localhost').searchParams;
      const envParam = params.get('env');
      const clientEnv = envParam === ClientEnv.JETBRAINS ? ClientEnv.JETBRAINS : ClientEnv.BROWSER;
      const panelId = params.get('panelId');

      // Origin was already validated during the upgrade; keep it on the record
      // so connection types (panel / tunnel / browser) can be told apart in
      // status reporting.
      const connectionId = connections.addConnection(
        ws,
        clientEnv,
        panelId,
        request.headers.origin ?? null,
      );
      console.error('[node-backend]', `Client connected: ${connectionId}`);

      // 연결 준비 신호 전송
      connections.sendTo(connectionId, MessageType.BRIDGE_READY);

      ws.on('message', (data: Buffer) => {
        let parsed: IPCMessage;
        try {
          parsed = JSON.parse(data.toString()) as IPCMessage;
        } catch {
          console.error('[node-backend]', 'Failed to parse incoming message:', data.toString());
          return;
        }
        const bridge = bridges[connections.getClientEnv(connectionId)];
        // Single activity entry point (mirrors reportBackendError below): every webview
        // request flows through here, so we record it as telemetry activity to keep the
        // Rybbit session alive for the real usage span. trackActivity excludes system
        // messages and gates on consent internally; it is fire-and-forget.
        trackActivity(parsed.type);
        // Single backend error boundary for the handler layer: any handler that throws
        // (or rejects) flows here, and reportBackendError is the ONLY place that reports it.
        // Individual handlers must NOT call trackError themselves — they rethrow to here.
        Promise.resolve(handleMessage(connectionId, parsed, connections, bridge, bridges)).catch((err) => {
          console.error('[node-backend]', `Unhandled error in handleMessage (${parsed.type}):`, err);
          reportBackendError(err instanceof Error ? err : new Error(String(err)), {
            layer: 'handler',
            messageType: parsed.type,
          });
        });
      });

      ws.on('close', () => {
        console.error('[node-backend]', `Client disconnected: ${connectionId}`);
        // An interactive `claude auth login` waiting on stdin won't exit on its
        // own once the webview is gone — kill it so it can't linger as a zombie.
        cancelLogin(connectionId);
        connections.removeConnection(connectionId);
      });
    });

    const httpServer: Server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const urlPath = (req.url ?? '/').split('?')[0];

        // /version is a harmless read used as a port-readiness/health probe by the
        // bootstrap (Kotlin/foreground.sh) BEFORE any token is available. Leave it
        // UNAUTHENTICATED so readiness probes keep working; it exposes no secrets
        // and mutates nothing.
        if (urlPath === '/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ version: getPluginVersion() }));
          return;
        }

        // POST /pair — short-lived one-time pairing exchange for the Remote-Control
        // tunnel. The remote device has NO auth token yet; the single-use pairing
        // code (delivered out-of-band via the QR the operator shows) IS its
        // credential, so this endpoint is intentionally reachable WITHOUT the auth
        // token. A valid, unexpired, unconsumed code → 200 { token }; invalid or
        // expired → 401; rate-limited/locked → 429.
        //
        // Design choice (documented): returning the token to anyone holding a live
        // code IS the intended handshake. The protection is the code's 192-bit
        // entropy + short TTL + single-use + lockout, NOT URL/endpoint secrecy.
        // The route is always-on and gated purely on "is there a live issued
        // code": with no code issued (tunnel off) every attempt fails as 'invalid'.
        // The code and token are never logged.
        if (req.method === 'POST' && urlPath === '/pair') {
          const headerCode = req.headers[PAIR_CODE_HEADER];
          let code = Array.isArray(headerCode) ? headerCode[0] : headerCode;
          if (!code) {
            try {
              const rawBody = await readRequestBody(req);
              if (rawBody) {
                const parsed = JSON.parse(rawBody) as { code?: unknown };
                if (typeof parsed.code === 'string') code = parsed.code;
              }
            } catch {
              // Missing/invalid body → treated as an invalid code below.
            }
          }
          const result = tunnelPairing.redeem(code ?? '');
          if (result.ok) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ token: result.token }));
          } else if (result.reason === 'locked') {
            console.error('[node-backend]', 'Pairing attempt rejected: rate-limited (locked)');
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many attempts' }));
          } else {
            console.error('[node-backend]', `Pairing attempt rejected: ${result.reason}`);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid or expired pairing code' }));
          }
          return;
        }

        // /internal/* are loopback-only IDE→backend mutation pushes. Defense-in-depth:
        // require the per-launch token via the `x-ccg-token` HTTP header (Bearer-style
        // custom header — chosen over Authorization to avoid clashing with Claude's own
        // auth and proxy rewrites). Missing/invalid → 401. Static file serving and
        // /version stay unauthenticated (webview bootstrap must load before it has a token).
        // TODO(phase 2): Kotlin's editor-context / ide-selection POSTs must send this header.
        if (urlPath.startsWith('/internal/')) {
          const httpToken = req.headers[HTTP_AUTH_HEADER];
          const provided = Array.isArray(httpToken) ? httpToken[0] : httpToken;
          if (!timingSafeTokenEqual(provided, authToken)) {
            console.error('[node-backend]', `Rejected ${req.method} ${urlPath}: missing or invalid auth token`);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
        }

        // Runtime status snapshot for the IDE status-bar card (and the future
        // exit-confirm modal): keep-alive gate, connection counts by type,
        // session/streaming counts. Read-only, no secrets. Sits after the
        // /internal/* auth guard above, so it too requires the per-launch token.
        if (req.method === 'GET' && urlPath === '/internal/status') {
          const result = handleStatusRequest(connections);
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.body));
          return;
        }

        // IDE → backend editor selection push. Kotlin POSTs the active editor
        // selection here (loopback only); we route it to the webview as
        // EDITOR_CONTEXT, buffering it if no webview is connected yet.
        if (req.method === 'POST' && urlPath === '/internal/editor-context') {
          let rawBody: string;
          try {
            rawBody = await readRequestBody(req);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to read request body' }));
            return;
          }
          const result = handleEditorContextRequest(connections, rawBody);
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.body));
          return;
        }

        // IDE → backend passive selection push. Kotlin POSTs the active editor
        // selection here (loopback only); we route it to the webview as
        // IDE_SELECTION. Unlike editor-context, no buffering: the next selection
        // event supersedes, so we drop the payload if no webview is connected.
        if (req.method === 'POST' && urlPath === '/internal/ide-selection') {
          let rawBody: string;
          try {
            rawBody = await readRequestBody(req);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to read request body' }));
            return;
          }
          const result = handleIdeSelectionRequest(connections, rawBody);
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.body));
          return;
        }

        if (webviewDir) {
          await serveStaticFile(webviewDir, req.url ?? '/', res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      },
    );

    // /ws, /logs 경로 WebSocket 업그레이드 (Origin 검증 공통 적용)
    httpServer.on('upgrade', (request, socket, head) => {
      const url = request.url;

      // Origin 검증 — /ws, /rpc, /logs 공통. Origin은 인증이 아니라 CSWSH 방어
      // 하드닝 레이어로 그대로 유지한다(약화 금지). 실제 인증은 아래 토큰이 담당.
      const origin = request.headers.origin;
      if (!validateOrigin(origin, request.headers.host, allowSameOrigin)) {
        console.error('[node-backend]', `WebSocket connection rejected: disallowed origin "${origin}"`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // 토큰 검증 — /ws, /rpc, /logs 공통. Sec-WebSocket-Protocol 헤더에서
      // `ccg-auth` 마커와 짝지어진 토큰을 constant-time 비교한다. 누락/불일치는
      // 401로 소켓 종료. 토큰 값은 절대 로그로 남기지 않는다(성공/실패만).
      // TODO(phase 2): webview 연결 빌더가 `new WebSocket(url, ['ccg-auth', token])`로
      //   이 토큰을 부착해야 정상 UX가 복구된다. CLI/Kotlin은 토큰을 env로 전파.
      const protocolHeader = request.headers['sec-websocket-protocol'];
      if (!validateAuthToken(protocolHeader, authToken)) {
        console.error('[node-backend]', 'WebSocket connection rejected: missing or invalid auth token');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const urlPath = (url ?? '').split('?')[0];

      if (urlPath === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          wss.emit('connection', ws, request);
        });
      } else if (urlPath === '/rpc') {
        rpcWss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          const jetbrainsBridge = bridges[ClientEnv.JETBRAINS];
          if ('addRpcClient' in jetbrainsBridge && typeof (jetbrainsBridge as any).addRpcClient === 'function') {
            (jetbrainsBridge as any).addRpcClient(ws);
          }
        });
      } else if (url === '/logs' && logWs) {
        logWs.handleUpgrade(request, socket, head);
      } else {
        socket.destroy();
      }
    });

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      reject(err);
    });

    httpServer.listen(port, host, () => {
      const addr = httpServer.address();
      const assignedPort = typeof addr === 'object' && addr !== null ? addr.port : port;
      console.error('[node-backend]', `WebSocket server listening on ${host}:${assignedPort}`);

      resolve({
        connections,
        port: assignedPort,
        logWs,
        close: () => {
          logWs?.close();
          rpcWss.close();
          wss.close();
          httpServer.close();
        },
      });
    });
  });
}
