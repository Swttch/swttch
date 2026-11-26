import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/readSessionTail', () => ({
  readSessionTail: vi.fn(),
}));
vi.mock('../../features/getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(async (dir: string) => `/sessions${dir}`),
}));

import { getSessionTailHandler, SESSION_TAIL_DEFAULT_LIMIT, SESSION_TAIL_MAX_LIMIT } from '../getSessionTail';
import { readSessionTail } from '../../features/readSessionTail';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const readTail = vi.mocked(readSessionTail);
const bridge = {} as Bridge;
// Joined the way the handler joins it, so the separators are the ones of the OS the test runs on.
const RECORD = join('/sessions/w', 's.jsonl');

function conns() {
  return { sendTo: vi.fn(), subscribe: vi.fn() } as unknown as ConnectionManager & { sendTo: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
}

function msg(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.GET_SESSION_TAIL, payload, timestamp: 0, requestId: 'req-1' };
}

const ENTRIES = [{ uuid: 'a', type: 'user', anything: { nested: true } }, { uuid: 'b', type: 'assistant' }];

describe('getSessionTailHandler', () => {
  beforeEach(() => {
    readTail.mockReset();
    readTail.mockResolvedValue(ENTRIES as never);
  });

  it('answers with the newest entries exactly as the record holds them', async () => {
    const c = conns();
    await getSessionTailHandler('conn', msg({ workingDir: '/w', sessionId: 's' }), c, bridge);
    expect(readTail).toHaveBeenCalledWith(RECORD, SESSION_TAIL_DEFAULT_LIMIT);
    const [, type, body] = c.sendTo.mock.calls[0];
    expect(type).toBe(MessageType.ACK);
    expect(body).toMatchObject({ requestId: 'req-1', status: 'ok' });
    expect((body as { messages: unknown }).messages).toBe(ENTRIES);
  });

  it('only reads: it does not subscribe the connection to the session', async () => {
    const c = conns();
    await getSessionTailHandler('conn', msg({ workingDir: '/w', sessionId: 's' }), c, bridge);
    expect(c.subscribe).not.toHaveBeenCalled();
  });

  it('cuts how many it sends to the number asked, and to a ceiling', async () => {
    const c = conns();
    await getSessionTailHandler('conn', msg({ workingDir: '/w', sessionId: 's', limit: 12 }), c, bridge);
    expect(readTail).toHaveBeenLastCalledWith(RECORD, 12);
    await getSessionTailHandler('conn', msg({ workingDir: '/w', sessionId: 's', limit: 100000 }), c, bridge);
    expect(readTail).toHaveBeenLastCalledWith(RECORD, SESSION_TAIL_MAX_LIMIT);
    await getSessionTailHandler('conn', msg({ workingDir: '/w', sessionId: 's', limit: -3 }), c, bridge);
    expect(readTail).toHaveBeenLastCalledWith(RECORD, SESSION_TAIL_DEFAULT_LIMIT);
  });

  it('says what is missing, and reads nothing, when the folder or the session is not named', async () => {
    const c = conns();
    await getSessionTailHandler('conn', msg({ sessionId: 's' }), c, bridge);
    await getSessionTailHandler('conn', msg({ workingDir: '/w' }), c, bridge);
    expect(readTail).not.toHaveBeenCalled();
    for (const call of c.sendTo.mock.calls) expect(call[2]).toMatchObject({ status: 'error' });
  });

  it('reads nothing for a session id that could lead out of the sessions folder', async () => {
    const c = conns();
    await getSessionTailHandler('conn', msg({ workingDir: '/w', sessionId: '../../secret' }), c, bridge);
    expect(readTail).not.toHaveBeenCalled();
    expect(c.sendTo.mock.calls[0][2]).toMatchObject({ status: 'error' });
  });

  it('answers with no entries for a session that has no record', async () => {
    readTail.mockRejectedValue(Object.assign(new Error('no such file'), { code: 'ENOENT' }));
    const c = conns();
    await getSessionTailHandler('conn', msg({ workingDir: '/w', sessionId: 's' }), c, bridge);
    expect(c.sendTo.mock.calls[0][2]).toMatchObject({ status: 'ok', messages: [] });
  });

  it('answers with the error when the record cannot be read', async () => {
    readTail.mockRejectedValue(new Error('unreadable'));
    const c = conns();
    await getSessionTailHandler('conn', msg({ workingDir: '/w', sessionId: 's' }), c, bridge);
    expect(c.sendTo.mock.calls[0][2]).toMatchObject({ status: 'error', error: 'unreadable' });
  });
});
