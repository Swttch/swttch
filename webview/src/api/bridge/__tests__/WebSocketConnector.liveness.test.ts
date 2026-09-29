import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketConnector } from '../WebSocketConnector';
import { MessageType } from '@/shared';

/*
 * A socket whose return path has died stays OPEN in the page: nothing tells the
 * tab, so the transcript waits forever for events that can no longer arrive
 * (issue #479). The page measures the backend's silence to notice, and these
 * cases pin both halves of that — that it does notice, and that it does not
 * mistake a quiet-by-design backend for a dead one.
 */

const HEARTBEAT_INTERVAL_MS = 30_000;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;

  readyState = 0;
  closeCount = 0;
  sent: string[] = [];
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

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCount++;
  }

  /** Complete the handshake, as the browser would. */
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  /** Deliver one backend message to the page. */
  deliver(type: string, payload: Record<string, unknown> = {}): void {
    this.onmessage?.({ data: JSON.stringify({ type, payload, timestamp: Date.now() }) });
  }

  beat(): void {
    this.deliver(MessageType.HEARTBEAT, { intervalMs: HEARTBEAT_INTERVAL_MS });
  }
}

/** Connect a connector to a fake socket and finish its handshake. */
async function connectOne(): Promise<{ connector: WebSocketConnector; socket: FakeWebSocket }> {
  const connector = new WebSocketConnector();
  const connected = connector.connect();
  // The token resolves on a microtask before the socket is opened.
  await vi.advanceTimersByTimeAsync(0);
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  socket.open();
  await connected;
  return { connector, socket };
}

describe('WebSocketConnector — noticing a socket the backend stopped answering on', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeWebSocket.instances = [];
  });

  it('drops the socket and reconnects after the backend goes silent', async () => {
    const { connector, socket } = await connectOne();
    expect(connector.isConnected).toBe(true);

    socket.beat();

    // Three beats' worth of silence is the page's tolerance; it must still be
    // connected on the way there, because a slow hop is not a dead backend.
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
    expect(socket.closeCount).toBe(0);
    expect(connector.isConnected).toBe(true);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(socket.closeCount).toBe(1);
    expect(connector.isConnected).toBe(false);

    // And it comes back on its own rather than sitting there disconnected.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    connector.disconnect();
  });

  it('stays connected for as long as the beats keep arriving', async () => {
    const { connector, socket } = await connectOne();

    for (let round = 0; round < 20; round++) {
      socket.beat();
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    }

    expect(socket.closeCount).toBe(0);
    expect(connector.isConnected).toBe(true);

    connector.disconnect();
  });

  it('takes ordinary traffic as proof the socket is alive', async () => {
    const { connector, socket } = await connectOne();
    socket.beat();

    // No further beats, but the session is streaming — which is exactly when
    // dropping the socket would be most expensive.
    for (let round = 0; round < 20; round++) {
      socket.deliver(MessageType.CLI_EVENT, { raw: 'chunk' });
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    }

    expect(socket.closeCount).toBe(0);
    expect(connector.isConnected).toBe(true);

    connector.disconnect();
  });

  it('never gives up on a backend that does not send beats at all', async () => {
    // An older standalone runtime is quiet by design. Reading that as a dead
    // socket would drop a perfectly good connection every couple of minutes.
    const { connector, socket } = await connectOne();

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 20);

    expect(socket.closeCount).toBe(0);
    expect(connector.isConnected).toBe(true);

    connector.disconnect();
  });

  it('answers the beat, so the backend never has to rely on a control frame', async () => {
    // The backend also counts pongs, but a pong is a WebSocket control frame and
    // a tunnel adds hops we do not control. A hop that forwards application data
    // while dropping control frames would make this very page look like the
    // client that vanished (issue #479), so the answer is application data.
    const { connector, socket } = await connectOne();

    socket.beat();

    const replies = socket.sent.map((raw) => JSON.parse(raw) as { type: string });
    expect(replies.filter((m) => m.type === MessageType.HEARTBEAT)).toHaveLength(1);

    connector.disconnect();
  });

  it('keeps the beat to itself and passes everything else on', async () => {
    const { connector, socket } = await connectOne();
    const seen: string[] = [];
    connector.onMessage((message) => seen.push(message.type));

    socket.beat();
    socket.deliver(MessageType.SESSIONS_UPDATED);

    expect(seen).toEqual([MessageType.SESSIONS_UPDATED]);

    connector.disconnect();
  });

  it('stops watching once the page disconnects on purpose', async () => {
    const { connector, socket } = await connectOne();
    socket.beat();

    connector.disconnect();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 20);

    // One close from disconnect() itself, and nothing from the watchdog after.
    expect(socket.closeCount).toBe(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
