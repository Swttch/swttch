import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The handler must NOT touch the filesystem in these tests; stub the lister so
// we only assert the handler's routing (guard vs. normal listing).
vi.mock('../../features/getSessionsList', () => ({
  getSessionsList: vi.fn(),
}));
vi.mock('../../features/getNestedSessionsList', () => ({
  getNestedSessionsList: vi.fn(async () => ({ sessions: [], total: 0, hasMore: false })),
}));

import { getSessionsHandler } from '../getSessions';
import { getSessionsList } from '../../features/getSessionsList';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';
import { announceSessionsUpdated } from '../../features/sessionsUpdated';

const mockGetSessionsList = vi.mocked(getSessionsList);
const bridge = {} as Bridge;

function mockConns() {
  return { sendTo: vi.fn(), registerListScope: vi.fn() } as unknown as ConnectionManager;
}

function lastSend(conns: ConnectionManager): [string, string, Record<string, unknown>] {
  const calls = (conns.sendTo as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1] as [string, string, Record<string, unknown>];
}

function msg(workingDir?: string): IPCMessage {
  return {
    type: MessageType.GET_SESSIONS,
    payload: workingDir === undefined ? {} : { workingDir },
    timestamp: 0,
    requestId: 'req-1',
  };
}

const originalPlatform = process.platform;
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

describe('getSessionsHandler', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => setPlatform(originalPlatform));

  it('errors and does not list when workingDir is missing', async () => {
    const conns = mockConns();
    await getSessionsHandler('c1', msg(undefined), conns, bridge);

    const [connId, type, payload] = lastSend(conns);
    expect(connId).toBe('c1');
    expect(type).toBe(MessageType.ERROR);
    expect(String(payload.error)).toMatch(/workingDir/);
    expect(mockGetSessionsList).not.toHaveBeenCalled();
  });

  it('on win32 with a backslash WSL UNC path, returns a WSL_HOST_MISMATCH notice without reading sessions', async () => {
    setPlatform('win32');
    const conns = mockConns();
    await getSessionsHandler('c1', msg('\\\\wsl.localhost\\Ubuntu\\home\\yhk\\ccg-test'), conns, bridge);

    const [connId, type, payload] = lastSend(conns);
    expect(connId).toBe('c1');
    expect(type).toBe(MessageType.ACK);
    expect(payload.requestId).toBe('req-1');
    expect(payload.sessions).toEqual([]);
    expect(payload.serviceError).toEqual({
      type: MessageType.WSL_HOST_MISMATCH,
      reason: expect.stringContaining('WSL'),
    });
    expect(mockGetSessionsList).not.toHaveBeenCalled();
  });

  it('on win32 also guards the forward-slashed UNC form the IDE hands over', async () => {
    setPlatform('win32');
    const conns = mockConns();
    await getSessionsHandler('c1', msg('//wsl.localhost/Ubuntu/home/yhk/ccg-test'), conns, bridge);

    const [, type, payload] = lastSend(conns);
    expect(type).toBe(MessageType.ACK);
    expect((payload.serviceError as { type?: string })?.type).toBe(MessageType.WSL_HOST_MISMATCH);
    expect(mockGetSessionsList).not.toHaveBeenCalled();
  });

  it('on win32 with a normal Windows path, lists sessions as usual (no serviceError)', async () => {
    setPlatform('win32');
    mockGetSessionsList.mockResolvedValue({
      sessions: [
        {
          sessionId: 's1',
          sessionDir: 'C:\\Users\\yhk\\proj',
          title: 'T',
          createdAt: '2026-01-01T00:00:00.000Z',
          lastTimestamp: null,
          messageCount: 1,
          isSidechain: false,
        },
      ],
      total: 1,
      hasMore: false,
    } as never);
    const conns = mockConns();
    await getSessionsHandler('c1', msg('C:\\Users\\yhk\\proj'), conns, bridge);

    const [, type, payload] = lastSend(conns);
    expect(type).toBe(MessageType.ACK);
    expect(payload.sessions).toHaveLength(1);
    expect(payload.serviceError).toBeUndefined();
    // Paging is opt-in: a request that names no limit still asks for everything.
    expect(mockGetSessionsList).toHaveBeenCalledWith('C:\\Users\\yhk\\proj', {
      offset: undefined,
      limit: undefined,
    });
  });

  it('on linux (JetBrains in-distro backend) the win32 UNC guard does not trip — lists normally', async () => {
    setPlatform('linux');
    mockGetSessionsList.mockResolvedValue({ sessions: [], total: 0, hasMore: false } as never);
    const conns = mockConns();
    await getSessionsHandler('c1', msg('//wsl.localhost/Ubuntu/home/yhk/ccg-test'), conns, bridge);

    const [, type, payload] = lastSend(conns);
    expect(type).toBe(MessageType.ACK);
    expect(payload.serviceError).toBeUndefined();
    expect(mockGetSessionsList).toHaveBeenCalled();
  });

  it('notes the list the screen asked for, before reading it, so the news that comes meanwhile is not missed', async () => {
    mockGetSessionsList.mockImplementation(async () => {
      expect(conns.registerListScope).toHaveBeenCalled();
      return { sessions: [], total: 0, hasMore: false } as never;
    });
    const conns = mockConns();

    await getSessionsHandler('c1', { ...msg('/work'), payload: { workingDir: '/work', includeNested: false } }, conns, bridge);

    expect(conns.registerListScope).toHaveBeenCalledWith('c1', { rootDir: '/work', includeNested: false });
  });

  it('notes whether the list takes the folders below', async () => {
    mockGetSessionsList.mockResolvedValue({ sessions: [], total: 0, hasMore: false } as never);
    const conns = mockConns();

    await getSessionsHandler('c1', { ...msg('/work'), payload: { workingDir: '/work', includeNested: true } }, conns, bridge);

    expect(conns.registerListScope).toHaveBeenCalledWith('c1', { rootDir: '/work', includeNested: true });
  });

  describe('when several screens ask for the same list at once', () => {
    const page = (id: string) => ({ sessions: [{ sessionId: id }], total: 1, hasMore: false, nextOffset: 1, scopeDirCount: 1 }) as never;
    const asking = (requestId: string, payload: Record<string, unknown> = {}): IPCMessage => ({
      type: MessageType.GET_SESSIONS,
      payload: { workingDir: '/work', limit: 30, ...payload },
      timestamp: 0,
      requestId,
    });

    it('reads once for the ones that came while a read ran, when nothing was said since it began', async () => {
      let finishFirst!: (value: never) => void;
      mockGetSessionsList.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve as typeof finishFirst; }));
      const conns = mockConns();

      const answered = [
        getSessionsHandler('c1', asking('r1'), conns, bridge),
        getSessionsHandler('c2', asking('r2'), conns, bridge),
        getSessionsHandler('c3', asking('r3'), conns, bridge),
        getSessionsHandler('c4', asking('r4'), conns, bridge),
      ];
      expect(mockGetSessionsList).toHaveBeenCalledTimes(1);

      finishFirst(page('shared'));
      await Promise.all(answered);

      expect(mockGetSessionsList).toHaveBeenCalledTimes(1);
      const sent = (conns.sendTo as ReturnType<typeof vi.fn>).mock.calls as Array<[string, string, Record<string, unknown>]>;
      expect(sent.map(([connId, , payload]) => [connId, payload.requestId]).sort()).toEqual([
        ['c1', 'r1'], ['c2', 'r2'], ['c3', 'r3'], ['c4', 'r4'],
      ]);
      expect(sent.every(([, , payload]) => (payload.sessions as Array<{ sessionId: string }>)[0].sessionId === 'shared')).toBe(true);
    });

    it('gives the ones that came after something was said the read after it, and answers each on its own request', async () => {
      let finishFirst!: (value: never) => void;
      mockGetSessionsList
        .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve as typeof finishFirst; }))
        .mockResolvedValueOnce(page('fresh'));
      const conns = mockConns();

      const first = getSessionsHandler('c1', asking('r1'), conns, bridge);
      // A session was archived while the read runs: it may have missed that.
      announceSessionsUpdated({ broadcastToAll: vi.fn() } as never, { action: 'refresh' });
      const answered = [
        first,
        getSessionsHandler('c2', asking('r2'), conns, bridge),
        getSessionsHandler('c3', asking('r3'), conns, bridge),
        getSessionsHandler('c4', asking('r4'), conns, bridge),
      ];
      expect(mockGetSessionsList).toHaveBeenCalledTimes(1);

      finishFirst(page('older'));
      await Promise.all(answered);

      expect(mockGetSessionsList).toHaveBeenCalledTimes(2);
      const sent = (conns.sendTo as ReturnType<typeof vi.fn>).mock.calls as Array<[string, string, Record<string, unknown>]>;
      const byRequest = Object.fromEntries(sent.map(([, , payload]) => [payload.requestId as string, (payload.sessions as Array<{ sessionId: string }>)[0].sessionId]));
      expect(byRequest).toEqual({ r1: 'older', r2: 'fresh', r3: 'fresh', r4: 'fresh' });
    });

    it('stamps each answer with when its read began, so a screen can tell what the answer already holds', async () => {
      let finishFirst!: (value: never) => void;
      mockGetSessionsList
        .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve as typeof finishFirst; }))
        .mockResolvedValueOnce(page('fresh'));
      const conns = mockConns();

      const first = getSessionsHandler('c1', asking('r1'), conns, bridge);
      announceSessionsUpdated({ broadcastToAll: vi.fn() } as never, { action: 'refresh' });
      const answered = [
        first,
        getSessionsHandler('c2', asking('r2'), conns, bridge),
        getSessionsHandler('c3', asking('r3'), conns, bridge),
      ];
      finishFirst(page('older'));
      await Promise.all(answered);

      const sent = (conns.sendTo as ReturnType<typeof vi.fn>).mock.calls as Array<[string, string, Record<string, unknown>]>;
      const tsOf = Object.fromEntries(sent.map(([, , payload]) => [payload.requestId as string, payload.ts as number]));
      expect(typeof tsOf.r1).toBe('number');
      // The request that waited was answered by a read that began after the first one.
      expect(tsOf.r2).toBeGreaterThan(tsOf.r1);
      // Requests that shared one read share its ts.
      expect(tsOf.r3).toBe(tsOf.r2);
    });

    it('does not make a screen asking for another folder or another page wait for them', async () => {
      let finishFirst!: (value: never) => void;
      mockGetSessionsList
        .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve as typeof finishFirst; }))
        .mockResolvedValueOnce(page('other-folder'))
        .mockResolvedValueOnce(page('other-page'));
      const conns = mockConns();

      const first = getSessionsHandler('c1', asking('r1'), conns, bridge);
      await getSessionsHandler('c2', asking('r2', { workingDir: '/elsewhere' }), conns, bridge);
      await getSessionsHandler('c3', asking('r3', { offset: 30 }), conns, bridge);

      expect(mockGetSessionsList).toHaveBeenCalledTimes(3);
      finishFirst(page('first'));
      await first;
    });
  });
});
