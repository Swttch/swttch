import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let sessionsDir = '';
vi.mock('../../features/getProjectSessionsPath', () => ({ getProjectSessionsPath: async () => sessionsDir }));
let starting = new Set<string>();
vi.mock('../../features/sessionToolAnnouncer', () => ({ isSessionStarting: (id: string) => starting.has(id) }));
const watchSessions = vi.fn();
vi.mock('../../features/sessionTranscriptFollower', () => ({ watchSessions: (...args: unknown[]) => watchSessions(...args) }));

import { getSessionsExistHandler, watchSessionsHandler } from '../watchSessions';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { IPCMessage } from '../../types';

const message = (payload: Record<string, unknown>) => ({ type: 'X', payload, requestId: 'r1', timestamp: 0 }) as unknown as IPCMessage;

describe('GET_SESSIONS_EXIST', () => {
  let sendTo: ReturnType<typeof vi.fn>;
  let connections: ConnectionManager;

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), 'exist-'));
    starting = new Set();
    sendTo = vi.fn();
    connections = { sendTo } as unknown as ConnectionManager;
  });
  afterEach(() => rmSync(sessionsDir, { recursive: true, force: true }));

  it('names the sessions whose transcript is gone, and only those', async () => {
    writeFileSync(join(sessionsDir, 'there.jsonl'), '{}\n');

    await getSessionsExistHandler('c', message({ sessionIds: ['there', 'gone'], workingDir: '/w' }), connections, {} as never);

    expect(sendTo).toHaveBeenCalledWith('c', MessageType.ACK, { requestId: 'r1', status: 'ok', missing: ['gone'] });
  });

  it('does not call a session that is still being started a deleted one', async () => {
    starting = new Set(['new']);

    await getSessionsExistHandler('c', message({ sessionIds: ['new', 'gone'], workingDir: '/w' }), connections, {} as never);

    expect(sendTo).toHaveBeenCalledWith('c', MessageType.ACK, { requestId: 'r1', status: 'ok', missing: ['gone'] });
  });

  it('refuses an id that is not a plain name', async () => {
    await getSessionsExistHandler('c', message({ sessionIds: ['../etc/passwd'], workingDir: '/w' }), connections, {} as never);

    expect(sendTo).toHaveBeenCalledWith('c', MessageType.ACK, { requestId: 'r1', status: 'ok', missing: [] });
  });
});

describe('WATCH_SESSIONS', () => {
  it('hands the screen\'s sessions, each with its folder, to the follower', async () => {
    const sendTo = vi.fn();
    const connections = { sendTo } as unknown as ConnectionManager;

    await watchSessionsHandler(
      'c',
      message({ sessions: [{ sessionId: 'a', workingDir: '/w1' }, { sessionId: '../x', workingDir: '/w' }, { sessionId: 'b' }, { sessionId: 'c', workingDir: '/w2' }] }),
      connections,
      {} as never,
    );

    expect(watchSessions).toHaveBeenCalledWith('c', [{ sessionId: 'a', workingDir: '/w1' }, { sessionId: 'c', workingDir: '/w2' }], connections);
    expect(sendTo).toHaveBeenCalledWith('c', MessageType.ACK, { requestId: 'r1', status: 'ok' });
  });
});
