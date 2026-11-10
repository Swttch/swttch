import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { startWebSocketServer } from '../ws-server';
import { LogWebSocketServer } from '../../logging/log-ws';
import { authToken } from '../../config/environment';
import { ClientEnv, MessageType } from '../../shared';
import type { Bridge } from '../../bridge/bridge-interface';
import type { ConnectionManager } from '../connection-manager';

// The long-poll transport exists for panels whose browser cannot open a
// WebSocket at all: on IntelliJ 2026.3 Remote Development the client-side JCEF
// proxies every HTTP request to the host but fails every WebSocket (#582).
// These tests drive a REAL server over plain HTTP, the only thing such a panel
// has, and pin that a long-poll client is a full control-channel client: same
// token gate, same connection registry, both directions of traffic, and a
// clean teardown.

const ALLOWED_ORIGIN = 'http://localhost';

function mockBridge(): Bridge {
  return {
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
  } as unknown as Bridge;
}

describe('long-poll control channel', () => {
  let base: string;
  let close: () => void;
  let connections: ConnectionManager;
  const handleMessage = vi.fn();

  const auth = (extra: Record<string, string> = {}) => ({
    'x-ccg-token': authToken,
    Origin: ALLOWED_ORIGIN,
    ...extra,
  });

  async function open(query = 'env=jetbrains&panelId=panel-lp'): Promise<string> {
    const res = await fetch(`${base}/lp/open?${query}`, { method: 'POST', headers: auth() });
    expect(res.status).toBe(200);
    const { sid } = (await res.json()) as { sid: string };
    return sid;
  }

  async function poll(sid: string): Promise<{ status: number; frames: Array<{ type: string }> }> {
    const res = await fetch(`${base}/lp/poll?sid=${sid}`, { headers: auth() });
    if (res.status !== 200) return { status: res.status, frames: [] };
    const raw = (await res.json()) as string[];
    return { status: 200, frames: raw.map((f) => JSON.parse(f)) };
  }

  beforeAll(async () => {
    const handle = await startWebSocketServer(
      0,
      '127.0.0.1',
      { [ClientEnv.BROWSER]: mockBridge(), [ClientEnv.JETBRAINS]: mockBridge() },
      handleMessage,
      undefined,
      new LogWebSocketServer(() => {}),
    );
    base = `http://127.0.0.1:${handle.port}`;
    close = handle.close;
    connections = handle.connections;
  });

  afterAll(() => close?.());

  it('refuses to open without the token', async () => {
    const res = await fetch(`${base}/lp/open?env=jetbrains`, {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it('refuses to open with a wrong token', async () => {
    const res = await fetch(`${base}/lp/open?env=jetbrains`, {
      method: 'POST',
      headers: auth({ 'x-ccg-token': `${authToken}-nope` }),
    });
    expect(res.status).toBe(401);
  });

  it('refuses a disallowed origin even with the token', async () => {
    const res = await fetch(`${base}/lp/open?env=jetbrains`, {
      method: 'POST',
      headers: auth({ Origin: 'https://evil.example' }),
    });
    expect(res.status).toBe(403);
  });

  it('registers as a connection for its panel and delivers BRIDGE_READY on the first poll', async () => {
    const sid = await open('env=jetbrains&panelId=panel-ready');
    expect(connections.getConnectionIdByPanelId('panel-ready')).toBeTruthy();

    const { status, frames } = await poll(sid);
    expect(status).toBe(200);
    expect(frames.map((f) => f.type)).toContain(MessageType.BRIDGE_READY);
  });

  it('holds an empty poll open and answers it as soon as the backend sends', async () => {
    const sid = await open('env=jetbrains&panelId=panel-push');
    await poll(sid); // drain BRIDGE_READY

    const pending = poll(sid);
    // Give the poll time to arrive and park before anything is sent.
    await new Promise((r) => setTimeout(r, 100));
    const connectionId = connections.getConnectionIdByPanelId('panel-push')!;
    connections.sendTo(connectionId, MessageType.HEARTBEAT, { intervalMs: 1 });

    const { frames } = await pending;
    expect(frames.map((f) => f.type)).toEqual([MessageType.HEARTBEAT]);
  });

  it('hands every sent frame to the message handler, in order, as that connection', async () => {
    const sid = await open('env=jetbrains&panelId=panel-send');
    const connectionId = connections.getConnectionIdByPanelId('panel-send');
    handleMessage.mockClear();

    const frames = [
      JSON.stringify({ type: 'FIRST', payload: {} }),
      JSON.stringify({ type: 'SECOND', payload: {} }),
    ];
    const res = await fetch(`${base}/lp/send?sid=${sid}`, {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(frames),
    });
    expect(res.status).toBe(204);

    await vi.waitFor(() => expect(handleMessage).toHaveBeenCalledTimes(2));
    expect(handleMessage.mock.calls.map((c) => c[0])).toEqual([connectionId, connectionId]);
    expect(handleMessage.mock.calls.map((c) => c[1].type)).toEqual(['FIRST', 'SECOND']);
  });

  it('requires the token on poll and send too', async () => {
    const sid = await open('env=jetbrains&panelId=panel-gate');
    const pollRes = await fetch(`${base}/lp/poll?sid=${sid}`, { headers: { Origin: ALLOWED_ORIGIN } });
    expect(pollRes.status).toBe(401);
    const sendRes = await fetch(`${base}/lp/send?sid=${sid}`, {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN },
      body: '[]',
    });
    expect(sendRes.status).toBe(401);
  });

  it('closes on request: the connection is removed and the session id stops working', async () => {
    const sid = await open('env=jetbrains&panelId=panel-close');
    expect(connections.getConnectionIdByPanelId('panel-close')).toBeTruthy();

    const res = await fetch(`${base}/lp/close?sid=${sid}`, { method: 'POST', headers: auth() });
    expect(res.status).toBe(204);

    expect(connections.getConnectionIdByPanelId('panel-close')).toBeFalsy();
    expect((await poll(sid)).status).toBe(410);
  });

  it('answers 410 for a session id it never issued, so the client reconnects', async () => {
    expect((await poll('no-such-session')).status).toBe(410);
  });
});
