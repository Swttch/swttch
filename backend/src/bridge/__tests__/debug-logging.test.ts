import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserBridge } from '../browser-bridge';
import { JetBrainsBridge } from '../jetbrains-bridge';
import { MessageType } from '../../shared';
import { LOG_LEVEL_ENV } from '../../logging/log-level';
import * as settings from '../../core/features/settings';

// "Debug Mode" is one switch kept equal in the backend, the host and the page (issue #723). Each
// environment's bridge decides what the host's switch is, and both must keep the contract.

describe('BrowserBridge debug logging', () => {
  beforeEach(() => {
    delete process.env[LOG_LEVEL_ENV];
  });
  afterEach(() => {
    delete process.env[LOG_LEVEL_ENV];
  });

  // Standalone has no host log, so the backend's own floor is the switch.
  it('reads the backend floor, and moves it when set', async () => {
    const bridge = new BrowserBridge();
    expect(await bridge.getDebugLogging()).toBe(false);

    await bridge.setDebugLogging(true);
    expect(await bridge.getDebugLogging()).toBe(true);

    await bridge.setDebugLogging(false);
    expect(await bridge.getDebugLogging()).toBe(false);
  });

  it('sees a backend that was launched with CCG_LOG_LEVEL=debug as already on', async () => {
    process.env[LOG_LEVEL_ENV] = 'debug';
    expect(await new BrowserBridge().getDebugLogging()).toBe(true);
  });
});

describe('JetBrainsBridge debug logging', () => {
  type Ws = {
    readyState: number;
    send: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    emitMessage: (o: unknown) => void;
  };

  function createMockWs(): Ws {
    let onMessage: ((data: Buffer) => void) | undefined;
    const ws = {
      readyState: 1,
      send: vi.fn(),
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'message') onMessage = cb;
      }),
      emitMessage: (o: unknown) => onMessage?.(Buffer.from(JSON.stringify(o))),
    };
    return ws;
  }

  function lastRequest(ws: Ws): { id: string; method: string; params: Record<string, unknown> } {
    const raw = ws.send.mock.calls[ws.send.mock.calls.length - 1]![0] as string;
    return JSON.parse(raw);
  }

  async function connectOneClient() {
    vi.spyOn(settings, 'readSettingsFile').mockResolvedValue({ hostMode: 'editor-tab' });
    const bridge = new JetBrainsBridge();
    const ws = createMockWs();
    bridge.addRpcClient(ws as never);
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
    ws.send.mockClear();
    return { bridge, ws };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the IDE for its switch and returns the answer', async () => {
    const { bridge, ws } = await connectOneClient();

    const answer = bridge.getDebugLogging();
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
    const request = lastRequest(ws);
    expect(request.method).toBe(MessageType.GET_DEBUG_LOGGING);
    ws.emitMessage({ jsonrpc: '2.0', id: request.id, result: { enabled: true } });

    await expect(answer).resolves.toBe(true);
  });

  it('reads anything but an explicit true as off', async () => {
    const { bridge, ws } = await connectOneClient();

    const answer = bridge.getDebugLogging();
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
    ws.emitMessage({ jsonrpc: '2.0', id: lastRequest(ws).id, result: {} });

    await expect(answer).resolves.toBe(false);
  });

  it('sends the new value to the IDE as a request', async () => {
    const { bridge, ws } = await connectOneClient();

    const done = bridge.setDebugLogging(true);
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
    const request = lastRequest(ws);
    expect(request.method).toBe(MessageType.SET_DEBUG_LOGGING);
    expect(request.params).toEqual({ enabled: true });
    ws.emitMessage({ jsonrpc: '2.0', id: request.id, result: { enabled: true } });

    await expect(done).resolves.toBeUndefined();
  });
});
