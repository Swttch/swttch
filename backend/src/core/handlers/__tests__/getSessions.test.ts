import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The handler must NOT touch the filesystem in these tests; stub the lister so
// we only assert the handler's routing (guard vs. normal listing).
vi.mock('../../features/getSessionsList', () => ({
  getSessionsList: vi.fn(),
}));

import { getSessionsHandler } from '../getSessions';
import { getSessionsList } from '../../features/getSessionsList';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockGetSessionsList = vi.mocked(getSessionsList);
const bridge = {} as Bridge;

function mockConns() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
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
});
