import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JetBrainsBridge, parseProjectRoots, redactRpcLog } from '../jetbrains-bridge';
import { MessageType } from '../../shared';
import * as settings from '../../core/features/settings';

type MsgHandler = (data: Buffer) => void;
type CloseHandler = () => void;

function createMockWs() {
  const handlers: { message?: MsgHandler; close?: CloseHandler } = {};
  const ws = {
    readyState: 1,
    send: vi.fn(),
    on: vi.fn((event: string, cb: MsgHandler | CloseHandler) => {
      if (event === 'message') handlers.message = cb as MsgHandler;
      if (event === 'close') handlers.close = cb as CloseHandler;
    }),
    // test helpers
    emitMessage: (obj: unknown) =>
      handlers.message?.(Buffer.from(JSON.stringify(obj))),
    emitClose: () => handlers.close?.(),
  };
  return ws as typeof ws & { emitMessage: (o: unknown) => void; emitClose: () => void };
}

function registerRoots(ws: ReturnType<typeof createMockWs>, roots: string[]) {
  ws.emitMessage({ jsonrpc: '2.0', method: 'REGISTER_PROJECT_ROOTS', params: { roots } });
}

/** The JSON-RPC method name sent on the wire for a given request. */
function sentMethod(ws: ReturnType<typeof createMockWs>): string | undefined {
  const call = ws.send.mock.calls[0]?.[0];
  return call ? (JSON.parse(call) as { method: string }).method : undefined;
}

describe('parseProjectRoots', () => {
  it('extracts a string array', () => {
    expect(parseProjectRoots({ roots: ['/a', '/b'] })).toEqual(['/a', '/b']);
  });
  it('drops non-string and empty entries', () => {
    expect(parseProjectRoots({ roots: ['/a', 1, '', null] })).toEqual(['/a']);
  });
  it('returns [] when absent or malformed', () => {
    expect(parseProjectRoots(undefined)).toEqual([]);
    expect(parseProjectRoots({})).toEqual([]);
    expect(parseProjectRoots({ roots: 'oops' })).toEqual([]);
  });
});

describe('JetBrainsBridge.isConnected', () => {
  it('is false with no RPC client, true once an open client connects', () => {
    const bridge = new JetBrainsBridge();
    expect(bridge.isConnected()).toBe(false);

    const ws = createMockWs();
    bridge.addRpcClient(ws as never);
    expect(bridge.isConnected()).toBe(true);
  });

  it('is false again after the only client disconnects', () => {
    const bridge = new JetBrainsBridge();
    const ws = createMockWs();
    bridge.addRpcClient(ws as never);
    ws.emitClose();
    expect(bridge.isConnected()).toBe(false);
  });

  it('ignores a client whose socket is not open', () => {
    const bridge = new JetBrainsBridge();
    const ws = createMockWs();
    ws.readyState = 3; // CLOSED
    bridge.addRpcClient(ws as never);
    expect(bridge.isConnected()).toBe(false);
  });
});

describe('JetBrainsBridge cross-IDE routing', () => {
  it('routes a request to the IDE that owns the path', async () => {
    const bridge = new JetBrainsBridge();
    const wsA = createMockWs();
    const wsB = createMockWs();
    bridge.addRpcClient(wsA as never);
    bridge.addRpcClient(wsB as never);
    registerRoots(wsA, ['/projA']);
    registerRoots(wsB, ['/projB']);

    const pending = bridge
      .openDiff({ filePath: '/projB/src/x.ts', oldContent: '', newContent: '' })
      .catch(() => {}); // request resolves only on a response; we assert the send target

    expect(wsB.send).toHaveBeenCalledTimes(1);
    expect(wsA.send).not.toHaveBeenCalled();
    expect(sentMethod(wsB)).toBe('OPEN_DIFF');
    await Promise.resolve();
    void pending;
  });

  it('does not record project roots as a normal notification request', () => {
    const bridge = new JetBrainsBridge();
    const ws = createMockWs();
    const handler = vi.fn();
    bridge.onNotification('REGISTER_PROJECT_ROOTS', handler);
    bridge.addRpcClient(ws as never);
    registerRoots(ws, ['/projA']);
    // The built-in interception must consume it, not the user handler.
    expect(handler).not.toHaveBeenCalled();
  });

  it('falls back to the remaining client after the owner disconnects', async () => {
    const bridge = new JetBrainsBridge();
    const wsA = createMockWs();
    const wsB = createMockWs();
    bridge.addRpcClient(wsA as never);
    bridge.addRpcClient(wsB as never);
    registerRoots(wsA, ['/projA']);
    registerRoots(wsB, ['/projB']);

    wsB.emitClose(); // owner of /projB goes away

    const pending = bridge
      .openFile('/projB/src/x.ts')
      .catch(() => {});

    // Only wsA remains open → it receives the request as a fallback.
    expect(wsA.send).toHaveBeenCalledTimes(1);
    expect(sentMethod(wsA)).toBe('OPEN_FILE');
    await Promise.resolve();
    void pending;
  });

  it('rejects when no client is connected', async () => {
    const bridge = new JetBrainsBridge();
    await expect(bridge.openFile('/x.ts')).rejects.toThrow(/No RPC client connected/);
  });
});

/** Parse the JSON-RPC message at call index [callIdx] sent to [ws]. */
function sentMessage(
  ws: ReturnType<typeof createMockWs>,
  callIdx = 0,
): { jsonrpc: string; method?: string; params?: Record<string, unknown>; id?: string } | undefined {
  const call = ws.send.mock.calls[callIdx]?.[0];
  return call ? JSON.parse(call) : undefined;
}

describe('JetBrainsBridge.pushHostMode', () => {
  it('sends a HOST_MODE_CHANGED JSON-RPC notification (no id) to a single client', () => {
    const bridge = new JetBrainsBridge();
    const ws = createMockWs();
    bridge.addRpcClient(ws as never);
    ws.send.mockClear(); // ignore any connect-time push

    bridge.pushHostMode('tool-window', ws as never);

    expect(ws.send).toHaveBeenCalledTimes(1);
    const msg = sentMessage(ws);
    expect(msg?.method).toBe(MessageType.HOST_MODE_CHANGED);
    expect(msg?.params).toEqual({ hostMode: 'tool-window' });
    // A notification carries NO id (so Kotlin never tries to reply).
    expect(msg?.id).toBeUndefined();
  });

  it('broadcasts to every connected client when no target ws is given', () => {
    const bridge = new JetBrainsBridge();
    const wsA = createMockWs();
    const wsB = createMockWs();
    bridge.addRpcClient(wsA as never);
    bridge.addRpcClient(wsB as never);
    wsA.send.mockClear();
    wsB.send.mockClear();

    bridge.pushHostMode('editor-tab');

    expect(sentMessage(wsA)?.method).toBe(MessageType.HOST_MODE_CHANGED);
    expect(sentMessage(wsA)?.params).toEqual({ hostMode: 'editor-tab' });
    expect(sentMessage(wsB)?.params).toEqual({ hostMode: 'editor-tab' });
  });
});

describe('JetBrainsBridge connect-time hostMode push', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('pushes the current hostMode to a newly connected RPC client', async () => {
    vi.spyOn(settings, 'readSettingsFile').mockResolvedValue({ hostMode: 'tool-window' });

    const bridge = new JetBrainsBridge();
    const ws = createMockWs();
    bridge.addRpcClient(ws as never);

    // The connect-time push reads settings asynchronously; let microtasks drain.
    await vi.waitFor(() => {
      expect(ws.send).toHaveBeenCalled();
    });

    const msg = sentMessage(ws);
    expect(msg?.method).toBe(MessageType.HOST_MODE_CHANGED);
    expect(msg?.params).toEqual({ hostMode: 'tool-window' });
  });

  // An IDE announces the projects it serves only AFTER the socket is up, so the
  // connect-time push above can only carry the global value. Once the roots
  // arrive we know which project's settings apply, so the merged value must be
  // pushed again — otherwise a project that overrides hostMode never takes
  // effect on the IDE side (issue #7).
  it('re-pushes the merged hostMode once the client announces its project roots', async () => {
    vi.spyOn(settings, 'readSettingsFile').mockResolvedValue({ hostMode: 'editor-tab' });
    vi.spyOn(settings, 'readMergedSettings').mockResolvedValue({
      settings: { hostMode: 'tool-window' },
      overrides: ['hostMode'],
    });

    const bridge = new JetBrainsBridge();
    const ws = createMockWs();
    bridge.addRpcClient(ws as never);
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
    ws.send.mockClear();

    registerRoots(ws, ['/home/u/proj']);

    await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
    const msg = sentMessage(ws);
    expect(msg?.method).toBe(MessageType.HOST_MODE_CHANGED);
    expect(msg?.params).toEqual({ hostMode: 'tool-window' });
    expect(settings.readMergedSettings).toHaveBeenCalledWith('/home/u/proj');
  });

  it('does not re-push when the client announces no roots', async () => {
    vi.spyOn(settings, 'readSettingsFile').mockResolvedValue({ hostMode: 'editor-tab' });
    const merged = vi.spyOn(settings, 'readMergedSettings');

    const bridge = new JetBrainsBridge();
    const ws = createMockWs();
    bridge.addRpcClient(ws as never);
    await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
    ws.send.mockClear();

    registerRoots(ws, []);

    expect(merged).not.toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalled();
  });
});

// A project-scoped hostMode must reach only the IDE windows serving that
// project. Pushing it to every client would flip the chat host in unrelated
// projects — the same "my setting changed by itself" symptom issue #7 reports.
describe('JetBrainsBridge.pushHostMode project targeting', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(settings, 'readSettingsFile').mockResolvedValue({ hostMode: 'editor-tab' });
  });

  it('pushes to only the clients serving the given project root', async () => {
    const bridge = new JetBrainsBridge();
    const a = createMockWs();
    const b = createMockWs();
    bridge.addRpcClient(a as never);
    bridge.addRpcClient(b as never);
    await vi.waitFor(() => {
      expect(a.send).toHaveBeenCalled();
      expect(b.send).toHaveBeenCalled();
    });
    registerRoots(a, ['/home/u/alpha']);
    registerRoots(b, ['/home/u/beta']);
    a.send.mockClear();
    b.send.mockClear();

    bridge.pushHostModeForProject('tool-window', '/home/u/alpha');

    expect(sentMessage(a)?.params).toEqual({ hostMode: 'tool-window' });
    expect(b.send).not.toHaveBeenCalled();
  });

  it('falls back to every client when no project path is given', async () => {
    const bridge = new JetBrainsBridge();
    const a = createMockWs();
    const b = createMockWs();
    bridge.addRpcClient(a as never);
    bridge.addRpcClient(b as never);
    await vi.waitFor(() => {
      expect(a.send).toHaveBeenCalled();
      expect(b.send).toHaveBeenCalled();
    });
    registerRoots(a, ['/home/u/alpha']);
    registerRoots(b, ['/home/u/beta']);
    a.send.mockClear();
    b.send.mockClear();

    bridge.pushHostModeForProject('tool-window', undefined);

    expect(sentMessage(a)?.params).toEqual({ hostMode: 'tool-window' });
    expect(sentMessage(b)?.params).toEqual({ hostMode: 'tool-window' });
  });
});

describe('redactRpcLog', () => {
  const req = (method: string, params: Record<string, unknown>) =>
    ({ jsonrpc: '2.0' as const, id: 'rpc-7', method, params });

  it('masks the pairing code carried in an OPEN_URL url', () => {
    const url =
      'http://localhost:33741/sessions/abc?workingDir=%2F%2Fwsl.localhost%2FUbuntu&pair=23C0UmxnhcediFn6MRYLr_a-I9kDBtxt';
    const out = redactRpcLog(req('OPEN_URL', { url }));
    expect(out).not.toContain('23C0UmxnhcediFn6MRYLr_a-I9kDBtxt');
    expect(out).toContain('pair=<redacted>');
  });

  it('masks a pairing code that is the first query param', () => {
    const out = redactRpcLog(req('OPEN_URL', { url: 'https://x.trycloudflare.com/?pair=SECRET123' }));
    expect(out).not.toContain('SECRET123');
    expect(out).toContain('pair=<redacted>');
  });

  it('defensively masks a token query param too', () => {
    const out = redactRpcLog(req('OPEN_URL', { url: 'http://h/p?token=deadbeefcafe' }));
    expect(out).not.toContain('deadbeefcafe');
    expect(out).toContain('token=<redacted>');
  });

  it('preserves non-secret fields (method, id, workingDir)', () => {
    const out = redactRpcLog(
      req('OPEN_URL', { url: 'http://localhost:33741/s?workingDir=%2Fhome%2Fu&pair=abc' }),
    );
    expect(out).toContain('"method":"OPEN_URL"');
    expect(out).toContain('"id":"rpc-7"');
    expect(out).toContain('workingDir=%2Fhome%2Fu');
  });

  it('leaves a request without secrets structurally intact', () => {
    const r = req('GET_IDE_ROOT', { workingDir: '//wsl.localhost/Ubuntu/home/yhk/proj' });
    expect(redactRpcLog(r)).toBe(JSON.stringify(r));
  });
});
