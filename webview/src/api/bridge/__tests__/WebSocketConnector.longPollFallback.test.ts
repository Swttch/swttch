import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketConnector } from '../WebSocketConnector';
import { _resetRuntimeCache } from '../../../config/environment';

/*
 * On IntelliJ 2026.3 Remote Development the panel's browser reaches the backend
 * over HTTP but its WebSockets never open (#582): in some builds they fail at
 * once, in others they hang in CONNECTING with neither `open` nor `close`. The
 * connector must notice both — WebSocket attempts that never open while the
 * backend still answers HTTP — and carry on over long-polling. It must not move
 * on a single failure, must not move once a WebSocket has ever opened, must not
 * move when the backend is simply down, and must go back to a WebSocket when the
 * long-poll connection that was working ends.
 */

const RETRY_INTERVAL_MS = 2_000;
const OPEN_TIMEOUT_MS = 6_000;

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
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }
  dropAfterOpen(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('WebSocketConnector — long-poll fallback when WebSockets are blocked', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let backendAnswersHttp: boolean;
  let pollWaiters: Array<(r: Response) => void>;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    pollWaiters = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    backendAnswersHttp = true;
    fetchMock = vi.fn((url: string) => {
      if (!backendAnswersHttp) return Promise.reject(new TypeError('Failed to fetch'));
      const path = new URL(url, window.location.href).pathname;
      if (path === '/version') return Promise.resolve(json(200, { version: 'test' }));
      if (path === '/lp/open') return Promise.resolve(json(200, { sid: 'sid-1' }));
      if (path === '/lp/poll') return new Promise<Response>((resolve) => pollWaiters.push(resolve)); // parked
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

  /** Let the connector's current attempt happen, then fail it the loud way. */
  async function failAttempt(index: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[index].failToOpen();
  }

  it('switches to long-polling after two WebSocket attempts in a row never open while HTTP still works', async () => {
    const connector = new WebSocketConnector();
    const connected = vi.fn();
    connector.onConnectionChange(connected);
    void connector.connect().catch(() => {});

    await failAttempt(0);
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    expect(FakeWebSocket.instances).toHaveLength(2); // one failure alone does not switch
    expect(lpOpenCalls()).toHaveLength(0);

    FakeWebSocket.instances[1].failToOpen();
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    expect(FakeWebSocket.instances).toHaveLength(2); // no third WebSocket
    expect(lpOpenCalls()).toHaveLength(1);
    expect(String(lpOpenCalls()[0][0])).toContain('env=');

    await vi.advanceTimersByTimeAsync(0);
    expect(connector.isConnected).toBe(true);
    expect(connected).toHaveBeenLastCalledWith(true);
    connector.disconnect();
  });

  it('switches when the WebSocket hangs without ever opening or closing', async () => {
    const connector = new WebSocketConnector();
    const firstConnect = connector.connect().catch((error: Error) => error);

    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS);
    // The first connect() call hears about the failed attempt, as it would for a loud failure.
    expect(await firstConnect).toEqual(expect.objectContaining({ message: 'WebSocket connection timed out' }));

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(lpOpenCalls()).toHaveLength(0); // a single hang does not switch

    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS + RETRY_INTERVAL_MS);
    expect(FakeWebSocket.instances).toHaveLength(2); // no third WebSocket
    expect(lpOpenCalls()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(0);
    expect(connector.isConnected).toBe(true);
    connector.disconnect();
  });

  it('does not count a WebSocket that opens in time as hanging', async () => {
    const connector = new WebSocketConnector();
    void connector.connect();

    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].open();
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS * 3);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(connector.isConnected).toBe(true);
    expect(lpOpenCalls()).toHaveLength(0);
    connector.disconnect();
  });

  it('keeps retrying the WebSocket when the backend does not answer HTTP either', async () => {
    backendAnswersHttp = false;
    const connector = new WebSocketConnector();
    void connector.connect().catch(() => {});

    await failAttempt(0);
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    FakeWebSocket.instances[1].failToOpen();
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(lpOpenCalls()).toHaveLength(0);
    connector.disconnect();
  });

  it('never switches once a WebSocket has opened, even when later attempts never open', async () => {
    const connector = new WebSocketConnector();
    void connector.connect();

    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].dropAfterOpen(); // a working socket that later drops

    // The backend then restarts: every attempt for a while never opens, yet HTTP answers.
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    FakeWebSocket.instances[1].failToOpen();
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    FakeWebSocket.instances[2].failToOpen();
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    FakeWebSocket.instances[3].failToOpen();
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(FakeWebSocket.instances).toHaveLength(5);
    expect(lpOpenCalls()).toHaveLength(0);
    connector.disconnect();
  });

  describe('once on long-polling', () => {
    /** Get a connector that has switched and is connected over long-polling. */
    async function connectedOverLongPoll(): Promise<WebSocketConnector> {
      const connector = new WebSocketConnector();
      void connector.connect().catch(() => {});
      await failAttempt(0);
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      FakeWebSocket.instances[1].failToOpen();
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(0);
      expect(connector.isConnected).toBe(true);
      expect(lpOpenCalls()).toHaveLength(1);
      return connector;
    }

    /** The backend forgets the session: the working long-poll connection ends. */
    async function dropLongPoll(): Promise<void> {
      const waiter = pollWaiters.shift();
      if (!waiter) throw new Error('no poll outstanding');
      waiter(json(410, { error: 'Gone' }));
      await vi.advanceTimersByTimeAsync(0);
    }

    it('tries a WebSocket again when the working long-poll connection ends, and stays on it once it opens', async () => {
      const connector = await connectedOverLongPoll();

      await dropLongPoll();
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      expect(FakeWebSocket.instances).toHaveLength(3); // the third WebSocket attempt
      expect(lpOpenCalls()).toHaveLength(1);

      FakeWebSocket.instances[2].open(); // the cause is gone: WebSockets work now
      expect(connector.isConnected).toBe(true);

      // Later outages are ordinary ones and never send the page back to long-polling.
      FakeWebSocket.instances[2].dropAfterOpen();
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      FakeWebSocket.instances[3].failToOpen();
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      FakeWebSocket.instances[4].failToOpen();
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      expect(lpOpenCalls()).toHaveLength(1);
      connector.disconnect();
    });

    it('goes straight back to long-polling when the returning WebSocket does not open', async () => {
      const connector = await connectedOverLongPoll();

      await dropLongPoll();
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      FakeWebSocket.instances[2].failToOpen(); // still blocked

      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      expect(FakeWebSocket.instances).toHaveLength(3); // no fourth WebSocket, no second-failure wait
      expect(lpOpenCalls()).toHaveLength(2);
      connector.disconnect();
    });

    it('also goes straight back when the returning WebSocket hangs', async () => {
      const connector = await connectedOverLongPoll();

      await dropLongPoll();
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      expect(FakeWebSocket.instances).toHaveLength(3);

      await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS + RETRY_INTERVAL_MS);
      expect(FakeWebSocket.instances).toHaveLength(3);
      expect(lpOpenCalls()).toHaveLength(2);
      connector.disconnect();
    });

    it('does not try a WebSocket again when long-polling never opened (the backend is down)', async () => {
      const connector = await connectedOverLongPoll();
      backendAnswersHttp = false;

      await dropLongPoll(); // the working connection ends ...
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      FakeWebSocket.instances[2].failToOpen(); // ... the returning WebSocket fails too ...
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS); // ... so the page is back on long-polling, whose open fails
      const webSocketsBefore = FakeWebSocket.instances.length;

      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 3);
      expect(FakeWebSocket.instances).toHaveLength(webSocketsBefore); // long-polling retries; no WebSocket probe each time
      connector.disconnect();
    });
  });
});
