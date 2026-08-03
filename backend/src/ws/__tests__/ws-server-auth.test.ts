import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WebSocket } from 'ws';
import net from 'net';
import { startWebSocketServer, AUTH_SUBPROTOCOL } from '../ws-server';
import { LogWebSocketServer } from '../../logging/log-ws';
import { authToken } from '../../config/environment';
import { ClientEnv } from '../../shared';
import { tunnelPairing, PAIRING_MAX_ATTEMPTS } from '../../core/features/tunnel-pairing';
import type { Bridge } from '../../bridge/bridge-interface';

// End-to-end auth tests: boot a REAL server on an ephemeral port and drive it
// with real WebSocket / HTTP clients. The token is carried in the standard
// Sec-WebSocket-Protocol header (`new WebSocket(url, ['ccg-auth', token])`) for
// WS, and in the `x-ccg-token` header for /internal/* HTTP POSTs. Origin is
// always set to an allowed value so these tests isolate the TOKEN gate from the
// (unchanged) Origin gate.

const ALLOWED_ORIGIN = 'http://localhost';
const WRONG_TOKEN = `${authToken}-nope`; // guaranteed different value

function createMockBridge(withRpc: boolean): Bridge {
  const base: Record<string, unknown> = {
    openFile: vi.fn(),
    openDiff: vi.fn(),
    applyDiff: vi.fn().mockResolvedValue({ applied: false }),
    rejectDiff: vi.fn(),
    refreshFiles: vi.fn(),
    createSession: vi.fn(),
    openNewTab: vi.fn(),
    openSettings: vi.fn(),
    openTerminal: vi.fn(),
    openUrl: vi.fn(),
    pickFiles: vi.fn().mockResolvedValue({ paths: [] }),
    updatePlugin: vi.fn(),
    requiresRestart: vi.fn().mockResolvedValue(false),
  };
  if (withRpc) base.addRpcClient = vi.fn();
  return base as unknown as Bridge;
}

type ConnectResult =
  | { ok: true; protocol: string }
  | { ok: false; status?: number };

/** Attempt a WebSocket upgrade and resolve with acceptance / rejection status. */
function tryWsConnect(
  port: number,
  path: string,
  protocols?: string[],
): Promise<ConnectResult> {
  return new Promise<ConnectResult>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, protocols, {
      origin: ALLOWED_ORIGIN,
    });
    ws.on('open', () => {
      const protocol = ws.protocol;
      ws.close();
      resolve({ ok: true, protocol });
    });
    ws.on('unexpected-response', (_req, res) => {
      resolve({ ok: false, status: res.statusCode });
      ws.terminate();
    });
    ws.on('error', () => {
      resolve({ ok: false });
    });
  });
}

describe('ws-server auth (Sec-WebSocket-Protocol token)', () => {
  let port: number;
  let close: () => void;

  beforeAll(async () => {
    const bridges = {
      [ClientEnv.BROWSER]: createMockBridge(false),
      [ClientEnv.JETBRAINS]: createMockBridge(true),
    };
    const logWs = new LogWebSocketServer(() => {});
    const handle = await startWebSocketServer(
      0,
      '127.0.0.1',
      bridges,
      async () => {},
      undefined,
      logWs,
    );
    port = handle.port;
    close = handle.close;
  });

  afterAll(() => {
    close?.();
  });

  describe.each(['/ws', '/rpc', '/logs'])('control channel %s', (path) => {
    it('rejects when the token is missing (origin allowed)', async () => {
      const result = await tryWsConnect(port, path, [AUTH_SUBPROTOCOL]);
      expect(result.ok).toBe(false);
      if (!result.ok && result.status !== undefined) {
        expect(result.status).toBe(401);
      }
    });

    it('rejects when the token is wrong (origin allowed)', async () => {
      const result = await tryWsConnect(port, path, [AUTH_SUBPROTOCOL, WRONG_TOKEN]);
      expect(result.ok).toBe(false);
      if (!result.ok && result.status !== undefined) {
        expect(result.status).toBe(401);
      }
    });

    it('accepts with the correct token and negotiates ccg-auth (never the token)', async () => {
      const result = await tryWsConnect(port, path, [AUTH_SUBPROTOCOL, authToken]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.protocol).toBe(AUTH_SUBPROTOCOL);
        expect(result.protocol).not.toBe(authToken);
      }
    });
  });

  describe('/internal/editor-context HTTP POST', () => {
    const body = JSON.stringify({ absolutePath: '/a/b.ts', relativePath: 'b.ts' });

    it('rejects with 401 when the x-ccg-token header is missing', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/internal/editor-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      expect(res.status).toBe(401);
    });

    it('rejects with 401 when the token is wrong', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/internal/editor-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ccg-token': WRONG_TOKEN },
        body,
      });
      expect(res.status).toBe(401);
    });

    it('processes the request with the correct token', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/internal/editor-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ccg-token': authToken },
        body,
      });
      expect(res.status).toBe(200);
    });
  });

  describe('/internal/ide-selection HTTP POST', () => {
    const body = JSON.stringify({ absolutePath: '/a/b.ts', relativePath: 'b.ts' });

    it('rejects with 401 when the token is missing', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/internal/ide-selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      expect(res.status).toBe(401);
    });

    it('processes the request with the correct token', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/internal/ide-selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ccg-token': authToken },
        body,
      });
      expect(res.status).toBe(200);
    });
  });

  // Non-WebSocket `Upgrade` requests (issue #191) — e.g. h2c (HTTP/2 cleartext),
  // which `java.net.http.HttpClient` sends by default. Node routes every
  // `Upgrade`-bearing request to the 'upgrade' handler, bypassing the normal
  // request handler entirely, so this must be answered explicitly (426) rather
  // than silently destroyed. `ws`/`fetch` can't send arbitrary Upgrade headers,
  // so we drive this with a raw net.Socket.
  describe('non-WebSocket upgrade (h2c)', () => {
    function sendRawUpgrade(rawUpgradeValue: string): Promise<string> {
      return new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1', () => {
          socket.write(
            `GET / HTTP/1.1\r\n` +
              `Host: 127.0.0.1:${port}\r\n` +
              `Origin: ${ALLOWED_ORIGIN}\r\n` +
              `Connection: Upgrade, HTTP2-Settings\r\n` +
              `Upgrade: ${rawUpgradeValue}\r\n` +
              `HTTP2-Settings: AAMAAABkAAQCAAAAAAIAAAAA\r\n` +
              `\r\n`,
          );
        });
        let data = '';
        socket.on('data', (chunk) => {
          data += chunk.toString();
          socket.end();
        });
        socket.on('close', () => resolve(data));
        socket.on('error', reject);
      });
    }

    it('receives an explicit 426, not a silent connection destroy', async () => {
      const response = await sendRawUpgrade('h2c');
      expect(response).toMatch(/^HTTP\/1\.1 426 Upgrade Required/);
    });

    it('is case-insensitive when checking the Upgrade header value', async () => {
      const response = await sendRawUpgrade('H2C');
      expect(response).toMatch(/^HTTP\/1\.1 426 Upgrade Required/);
    });
  });

  describe('/version health check', () => {
    it('is reachable WITHOUT a token (port-readiness probe)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/version`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { version: unknown };
      expect(json).toHaveProperty('version');
    });
  });

  // POST /pair — the short-lived one-time pairing exchange. Reachable WITHOUT
  // the auth token (the remote device has no token yet; the code is its
  // credential). Gated entirely on the pairing store. Each test issues a fresh
  // code first so the shared module singleton is in a known state.
  describe('/pair pairing exchange (no auth token required)', () => {
    it('returns the token for a valid, freshly-issued code (via JSON body)', async () => {
      const code = tunnelPairing.issueCode();
      const res = await fetch(`http://127.0.0.1:${port}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { token: unknown };
      expect(json.token).toBe(authToken);
    });

    it('accepts the code via the x-ccg-pair-code header', async () => {
      const code = tunnelPairing.issueCode();
      const res = await fetch(`http://127.0.0.1:${port}/pair`, {
        method: 'POST',
        headers: { 'x-ccg-pair-code': code },
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { token: unknown };
      expect(json.token).toBe(authToken);
    });

    it('consumes the code — a second redeem of the same code is 401', async () => {
      const code = tunnelPairing.issueCode();
      const first = await fetch(`http://127.0.0.1:${port}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      expect(first.status).toBe(200);
      const second = await fetch(`http://127.0.0.1:${port}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      expect(second.status).toBe(401);
    });

    it('rejects a wrong code with 401', async () => {
      tunnelPairing.issueCode();
      const res = await fetch(`http://127.0.0.1:${port}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'definitely-not-the-code' }),
      });
      expect(res.status).toBe(401);
    });

    it('locks out with 429 after too many wrong attempts', async () => {
      tunnelPairing.issueCode();
      let lastStatus = 0;
      for (let i = 0; i < PAIRING_MAX_ATTEMPTS; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'wrong' }),
        });
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);
      // Re-issue clears the lock so later tests are unaffected.
      tunnelPairing.issueCode();
    });

    it('never reflects the token in the pairing URL contract (token only in body)', async () => {
      const code = tunnelPairing.issueCode();
      const res = await fetch(`http://127.0.0.1:${port}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      // The token is delivered ONLY in the JSON response body of the exchange,
      // never encoded into any URL. The code carried in was not the token.
      expect(code).not.toBe(authToken);
      expect(res.status).toBe(200);
    });
  });
});
