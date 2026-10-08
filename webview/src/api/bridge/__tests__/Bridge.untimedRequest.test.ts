import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bridge } from '../Bridge';
import type { Connector, ConnectionChangeHandler, RawMessageHandler } from '../Connector';
import { MessageType } from '@/shared';

class FakeConnector implements Connector {
  isConnected = true;
  sent: IPCMessage[] = [];
  private messageHandlers = new Set<RawMessageHandler>();
  private changeHandlers = new Set<ConnectionChangeHandler>();

  async connect() {}
  disconnect() {}
  send(message: IPCMessage) {
    this.sent.push(message);
  }
  onMessage(handler: RawMessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }
  onConnectionChange(handler: ConnectionChangeHandler) {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }
  async ensureReady() {}

  /** What the backend does when the person finally picks a file. */
  answer(requestId: string | undefined, payload: Record<string, unknown>) {
    this.messageHandlers.forEach((handler) =>
      handler({ type: MessageType.ACK, requestId, payload: { requestId, ...payload }, timestamp: 0 } as IPCMessage),
    );
  }
  setConnected(connected: boolean) {
    this.isConnected = connected;
    this.changeHandlers.forEach((handler) => handler(connected));
  }
}

describe('Bridge request without a time limit', () => {
  let connector: FakeConnector;
  let bridge: Bridge;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    connector = new FakeConnector();
    bridge = new Bridge(connector);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('still hands over the answer when the person takes ten minutes to pick', async () => {
    const pending = bridge.request(MessageType.PICK_FILES, {}, { timeout: null });
    const requestId = connector.sent[0].requestId;

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    connector.answer(requestId, { paths: ['/a/화면 기록.mov'] });

    await expect(pending).resolves.toMatchObject({ paths: ['/a/화면 기록.mov'] });
  });

  it('gives up only when the connection is lost, since the answer can no longer arrive', async () => {
    const pending = bridge.request(MessageType.PICK_FILES, {}, { timeout: null });
    const assertion = expect(pending).rejects.toThrow('Bridge disconnected');

    connector.setConnected(false);
    await assertion;
  });

  it('leaves a request that has a time limit to its own clock when the connection drops', async () => {
    const pending = bridge.request(MessageType.GET_PROJECTS, {});
    const requestId = connector.sent[0].requestId;
    connector.setConnected(false);
    connector.setConnected(true);

    connector.answer(requestId, { ok: true });
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it('keeps the thirty second limit for every other request', async () => {
    const pending = bridge.request(MessageType.GET_PROJECTS, {});
    const assertion = expect(pending).rejects.toThrow('timed out');

    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});
