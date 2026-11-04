import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketConnector } from '../WebSocketConnector';
import { _resetRuntimeCache } from '../../../config/environment';

/*
 * The page retries its own socket for as long as it lives. When a run of those retries fails it
 * tells the IDE (`connection-lost` on the page-to-IDE channel), and the IDE puts the page back on
 * the live backend. These cases pin the page's half: how many failures make a report, that the
 * count starts over, and that the page never stops retrying whatever the IDE does with the report.
 */

const RETRY_INTERVAL_MS = 2_000;
const FAILED_ATTEMPTS_PER_REPORT = 5;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;

  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(
    public readonly url: string,
    public readonly protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  send(): void {}

  close(): void {}

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  /** The attempt ends without the socket ever having opened, as a refused or timed-out one does. */
  failToOpen(): void {
    this.onerror?.({});
    this.onclose?.({});
  }
}

/** Let the pending attempt start, and return its socket. */
async function nextAttempt(): Promise<FakeWebSocket> {
  await vi.advanceTimersByTimeAsync(0);
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

/** Fail the current attempt, then wait out the page's own retry interval so the next one starts. */
async function failAttempt(socket: FakeWebSocket): Promise<FakeWebSocket> {
  socket.failToOpen();
  await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

describe('WebSocketConnector — telling the IDE when its own retries keep failing', () => {
  let notify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    notify = vi.fn();
    (window as unknown as Record<string, unknown>).__notifyStreamingState = notify;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).__notifyStreamingState;
    delete (window as unknown as Record<string, unknown>).__JCEF__;
    _resetRuntimeCache();
    FakeWebSocket.instances = [];
  });

  /** Start a connector and swallow the rejection of its first connect(), which is not what is tested. */
  async function startConnector(): Promise<{ connector: WebSocketConnector; first: FakeWebSocket }> {
    const connector = new WebSocketConnector();
    connector.connect().catch(() => {});
    const first = await nextAttempt();
    return { connector, first };
  }

  it('stays quiet until the fifth attempt in a row has failed, then reports once', async () => {
    const { connector, first } = await startConnector();

    let socket = first;
    for (let attempt = 1; attempt < FAILED_ATTEMPTS_PER_REPORT; attempt++) {
      socket = await failAttempt(socket);
      expect(notify).not.toHaveBeenCalled();
    }

    socket.failToOpen();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('connection-lost');

    connector.disconnect();
  });

  it('starts counting again after a report and keeps reporting for as long as it stays cut off', async () => {
    const { connector, first } = await startConnector();

    let socket = first;
    for (let report = 1; report <= 3; report++) {
      for (let attempt = 1; attempt < FAILED_ATTEMPTS_PER_REPORT; attempt++) {
        socket = await failAttempt(socket);
      }
      socket.failToOpen();
      expect(notify).toHaveBeenCalledTimes(report);
      // Whatever the IDE does with the report, the page is still retrying.
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    }

    connector.disconnect();
  });

  it('counts only attempts in a row: a socket that opens clears the count', async () => {
    const { connector, first } = await startConnector();

    let socket = first;
    for (let attempt = 1; attempt < FAILED_ATTEMPTS_PER_REPORT; attempt++) {
      socket = await failAttempt(socket);
    }
    // The fifth attempt opens, so the four failures before it no longer count.
    socket.open();
    socket.onclose?.({});
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

    for (let attempt = 1; attempt < FAILED_ATTEMPTS_PER_REPORT; attempt++) {
      socket = await failAttempt(socket);
    }
    expect(notify).not.toHaveBeenCalled();

    socket.failToOpen();
    expect(notify).toHaveBeenCalledTimes(1);

    connector.disconnect();
  });

  it('has no IDE to tell in a plain browser, and goes on retrying', async () => {
    delete (window as unknown as Record<string, unknown>).__notifyStreamingState;
    const { connector, first } = await startConnector();

    let socket = first;
    for (let attempt = 1; attempt <= FAILED_ATTEMPTS_PER_REPORT + 1; attempt++) {
      socket = await failAttempt(socket);
    }

    expect(FakeWebSocket.instances.length).toBeGreaterThan(FAILED_ATTEMPTS_PER_REPORT);

    connector.disconnect();
  });
});
