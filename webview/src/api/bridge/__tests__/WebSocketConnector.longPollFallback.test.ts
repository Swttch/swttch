import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketConnector } from '../WebSocketConnector';
import { _resetRuntimeCache } from '../../../config/environment';

/*
 * On IntelliJ 2026.3 Remote Development the panel's browser reaches the backend
 * over HTTP but every WebSocket fails before it leaves the browser (#582). The
 * connector must notice that — a socket that never opened while the backend
 * still answers HTTP — and carry on over long-polling. A backend that is simply
 * down must NOT trigger the switch: that is the ordinary retry path.
 */

const RETRY_INTERVAL_MS = 2_000;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(): void {}
  close(): void {}
  failToOpen(): void {
    this.onerror?.({});
    this.onclose?.({ code: 1006 });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('WebSocketConnector — long-poll fallback when WebSockets are blocked', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let backendAnswersHttp: boolean;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    backendAnswersHttp = true;
    fetchMock = vi.fn((url: string) => {
      if (!backendAnswersHttp) return Promise.reject(new TypeError('Failed to fetch'));
      const path = new URL(url, window.location.href).pathname;
      if (path === '/version') return Promise.resolve(json(200, { version: 'test' }));
      if (path === '/lp/open') return Promise.resolve(json(200, { sid: 'sid-1' }));
      if (path === '/lp/poll') return new Promise<Response>(() => {}); // parked
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _resetRuntimeCache();
    FakeWebSocket.instances = [];
  });

  const lpOpenCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes('/lp/open'));

  it('switches to long-polling after a WebSocket never opens while HTTP still works', async () => {
    const connector = new WebSocketConnector();
    const connected = vi.fn();
    connector.onConnectionChange(connected);
    void connector.connect();

    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0].failToOpen();

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    expect(FakeWebSocket.instances).toHaveLength(1); // no second WebSocket
    expect(lpOpenCalls()).toHaveLength(1);
    expect(String(lpOpenCalls()[0][0])).toContain('env=');

    await vi.advanceTimersByTimeAsync(0);
    expect(connector.isConnected).toBe(true);
    expect(connected).toHaveBeenLastCalledWith(true);
    connector.disconnect();
  });

  it('keeps retrying the WebSocket when the backend does not answer HTTP either', async () => {
    backendAnswersHttp = false;
    const connector = new WebSocketConnector();
    void connector.connect().catch(() => {});

    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].failToOpen();
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(lpOpenCalls()).toHaveLength(0);
    connector.disconnect();
  });

  it('never switches once a WebSocket has opened', async () => {
    const connector = new WebSocketConnector();
    void connector.connect();

    await vi.advanceTimersByTimeAsync(0);
    const first = FakeWebSocket.instances[0];
    first.readyState = FakeWebSocket.OPEN;
    first.onopen?.({});
    first.onclose?.({ code: 1006 }); // a working socket that later drops

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(lpOpenCalls()).toHaveLength(0);
    connector.disconnect();
  });
});
