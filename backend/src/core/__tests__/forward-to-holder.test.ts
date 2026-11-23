import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardMessageToHolder, forwardToHolder, askHolderActivity } from '../forward-to-holder';
import { findLiveCliForSession } from '../cli-registry';

vi.mock('../cli-registry', () => ({ findLiveCliForSession: vi.fn() }));

const holder = (over: Record<string, unknown> = {}) => ({
  ownerAlive: true,
  entry: { pid: 10, sessionId: 's1', owner: { pid: 20 }, control: { port: 4321, token: 'tok' }, ...over },
});

describe('forwardMessageToHolder (#711)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hands the message to the backend that runs the CLI, with its token', async () => {
    vi.mocked(findLiveCliForSession).mockReturnValue(holder() as never);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const attachments = [{ type: 'file', fileName: 'a', absolutePath: '/a' }];
    const result = await forwardMessageToHolder('s1', { text: 'hi', attachments, messageUuid: 'u1' });
    expect(result).toBe('forwarded');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:4321/internal/session-control');
    expect(init.headers['x-ccg-token']).toBe('tok');
    expect(JSON.parse(init.body)).toEqual({ sessionId: 's1', action: 'send_message', text: 'hi', attachments, messageUuid: 'u1' });
  });

  it('has no holder to hand to when no live CLI or its backend is gone', async () => {
    vi.mocked(findLiveCliForSession).mockReturnValue(null);
    expect(await forwardMessageToHolder('s1', { text: 'hi' })).toBe('no_holder');
    vi.mocked(findLiveCliForSession).mockReturnValue({ ...holder(), ownerAlive: false } as never);
    expect(await forwardMessageToHolder('s1', { text: 'hi' })).toBe('no_holder');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a holder that wrote no address, or refused, or cannot be reached', async () => {
    vi.mocked(findLiveCliForSession).mockReturnValue(holder({ control: undefined }) as never);
    expect(await forwardMessageToHolder('s1', { text: 'hi' })).toBe('held_but_unreachable');
    vi.mocked(findLiveCliForSession).mockReturnValue(holder() as never);
    fetchMock.mockResolvedValue({ ok: false, status: 409 });
    expect(await forwardMessageToHolder('s1', { text: 'hi' })).toBe('held_but_unreachable');
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await forwardMessageToHolder('s1', { text: 'hi' })).toBe('held_but_unreachable');
  });
});

describe('forwardToHolder and askHolderActivity (#711)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hands any action of the control route to the holder, with the session id', async () => {
    vi.mocked(findLiveCliForSession).mockReturnValue(holder() as never);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    expect(await forwardToHolder('s1', { action: 'interrupt' })).toBe('forwarded');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sessionId: 's1', action: 'interrupt' });
  });

  it('asks the holder what the session is doing', async () => {
    vi.mocked(findLiveCliForSession).mockReturnValue(holder() as never);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, activity: 'running', turnStartedAt: 1234 }) });
    expect(await askHolderActivity('s1')).toEqual({ activity: 'running', turnStartedAt: 1234 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sessionId: 's1', action: 'activity' });
    expect(fetchMock.mock.calls[0][1].headers['x-ccg-token']).toBe('tok');
  });

  it('tells a holder that knows no turn in flight from one too old to say', async () => {
    vi.mocked(findLiveCliForSession).mockReturnValue(holder() as never);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, activity: 'idle', turnStartedAt: null }) });
    expect(await askHolderActivity('s1')).toEqual({ activity: 'idle', turnStartedAt: null });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, activity: 'idle' }) });
    expect(await askHolderActivity('s1')).toEqual({ activity: 'idle' });
  });

  it('knows nothing when there is no holder, it wrote no address, it does not know the question, or it cannot be reached', async () => {
    vi.mocked(findLiveCliForSession).mockReturnValue(null);
    expect(await askHolderActivity('s1')).toBeUndefined();
    vi.mocked(findLiveCliForSession).mockReturnValue(holder({ control: undefined }) as never);
    expect(await askHolderActivity('s1')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.mocked(findLiveCliForSession).mockReturnValue(holder() as never);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });
    expect(await askHolderActivity('s1')).toBeUndefined();
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await askHolderActivity('s1')).toBeUndefined();
  });
});
