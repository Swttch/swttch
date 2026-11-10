import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LongPollSocket } from '../LongPollSocket';

/*
 * LongPollSocket carries the control channel over plain HTTP for a panel whose
 * browser cannot open a WebSocket (IntelliJ 2026.3 Remote Development, #582).
 * It must look like a WebSocket to WebSocketConnector: open, deliver frames in
 * order, send frames in order, and close — with the token on every request.
 */

const BASE = 'http://localhost:4000';
const TOKEN = 'secret-token';

type Call = { url: string; init: RequestInit };

/** A scripted backend: each route answers from its own queue; polls wait until released. */
function fakeBackend() {
  const calls: Call[] = [];
  const pollWaiters: Array<(r: Response) => void> = [];
  let openResponse: () => Response = () => json(200, { sid: 'sid-1' });

  const fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (path === '/lp/open') return Promise.resolve(openResponse());
    if (path === '/lp/poll') {
      return new Promise<Response>((resolve, reject) => {
        pollWaiters.push(resolve);
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    if (path === '/lp/send' || path === '/lp/close') return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(new Response(null, { status: 404 }));
  });

  return {
    fetchMock,
    calls,
    setOpen(fn: () => Response) {
      openResponse = fn;
    },
    /** Answer the oldest outstanding poll. */
    answerPoll(status: number, frames: string[] = []) {
      const waiter = pollWaiters.shift();
      if (!waiter) throw new Error('no poll outstanding');
      waiter(json(status, frames));
    },
    pollsOutstanding: () => pollWaiters.length,
    sends: () =>
      calls.filter((c) => c.url.includes('/lp/send')).map((c) => JSON.parse(String(c.init.body)) as string[]),
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const settle = () => vi.waitFor(() => Promise.resolve());

describe('LongPollSocket', () => {
  let backend: ReturnType<typeof fakeBackend>;

  beforeEach(() => {
    backend = fakeBackend();
    vi.stubGlobal('fetch', backend.fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens with the /ws query and the token, then reports open', async () => {
    const socket = new LongPollSocket(BASE, 'env=jetbrains&panelId=p1', TOKEN);
    const onopen = vi.fn();
    socket.onopen = onopen;

    await vi.waitFor(() => expect(onopen).toHaveBeenCalled());
    expect(socket.readyState).toBe(1);
    const openCall = backend.calls[0];
    expect(openCall.url).toBe(`${BASE}/lp/open?env=jetbrains&panelId=p1`);
    expect(openCall.init.method).toBe('POST');
    expect((openCall.init.headers as Record<string, string>)['x-ccg-token']).toBe(TOKEN);
  });

  it('delivers polled frames to onmessage in order and keeps polling', async () => {
    const socket = new LongPollSocket(BASE, 'env=jetbrains', TOKEN);
    const received: string[] = [];
    socket.onmessage = (event) => received.push(event.data as string);

    await vi.waitFor(() => expect(backend.pollsOutstanding()).toBe(1));
    backend.answerPoll(200, ['{"n":1}', '{"n":2}']);
    await vi.waitFor(() => expect(received).toEqual(['{"n":1}', '{"n":2}']));
    await vi.waitFor(() => expect(backend.pollsOutstanding()).toBe(1));

    const pollCall = backend.calls.find((c) => c.url.includes('/lp/poll'))!;
    expect(pollCall.url).toBe(`${BASE}/lp/poll?sid=sid-1`);
    expect((pollCall.init.headers as Record<string, string>)['x-ccg-token']).toBe(TOKEN);
    socket.close();
  });

  it('sends frames in order, never more than one request at a time', async () => {
    const socket = new LongPollSocket(BASE, 'env=jetbrains', TOKEN);
    await vi.waitFor(() => expect(socket.readyState).toBe(1));

    socket.send('a');
    socket.send('b');
    socket.send('c');
    await vi.waitFor(() => expect(backend.sends().flat()).toEqual(['a', 'b', 'c']));
    socket.close();
  });

  it('closes with 1006 when the backend forgets the session (410)', async () => {
    const socket = new LongPollSocket(BASE, 'env=jetbrains', TOKEN);
    const onclose = vi.fn();
    socket.onclose = onclose;

    await vi.waitFor(() => expect(backend.pollsOutstanding()).toBe(1));
    backend.answerPoll(410);
    await vi.waitFor(() => expect(onclose).toHaveBeenCalledWith(expect.objectContaining({ code: 1006 })));
    expect(socket.readyState).toBe(3);
  });

  it('reports error then close, without ever opening, when open is refused', async () => {
    backend.setOpen(() => json(401, { error: 'Unauthorized' }));
    const socket = new LongPollSocket(BASE, 'env=jetbrains', TOKEN);
    const events: string[] = [];
    socket.onopen = () => events.push('open');
    socket.onerror = () => events.push('error');
    socket.onclose = () => events.push('close');

    await vi.waitFor(() => expect(events).toEqual(['error', 'close']));
    expect(socket.readyState).toBe(3);
  });

  it('close() tells the backend, stops polling and reports a clean close once', async () => {
    const socket = new LongPollSocket(BASE, 'env=jetbrains', TOKEN);
    const onclose = vi.fn();
    socket.onclose = onclose;
    await vi.waitFor(() => expect(backend.pollsOutstanding()).toBe(1));

    socket.close();
    socket.close();
    await settle();

    expect(backend.calls.some((c) => c.url === `${BASE}/lp/close?sid=sid-1`)).toBe(true);
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onclose).toHaveBeenCalledWith(expect.objectContaining({ code: 1000 }));
    expect(socket.readyState).toBe(3);
  });
});
