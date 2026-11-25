import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let sessionsDir = '';
let configDir = '';
vi.mock('../../features/getProjectSessionsPath', () => ({ getProjectSessionsPath: async () => sessionsDir }));
// Where the other project folders are searched: a folder of its own, never the real one.
vi.mock('../../features/claudeConfigDir', () => ({ getClaudeConfigDir: () => configDir }));
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
    configDir = mkdtempSync(join(tmpdir(), 'exist-config-'));
    starting = new Set();
    sendTo = vi.fn();
    connections = { sendTo } as unknown as ConnectionManager;
  });
  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  });

  it('names the sessions whose transcript is gone, and only those', async () => {
    writeFileSync(join(sessionsDir, 'there.jsonl'), '{}\n');

    await getSessionsExistHandler('c', message({ sessionIds: ['there', 'gone'], workingDir: '/w' }), connections, {} as never);

    expect(sendTo).toHaveBeenCalledWith('c', MessageType.ACK, { requestId: 'r1', status: 'ok', missing: ['gone'] });
  });

  // The card of a session another session started for another project's folder asks with its own folder (the
  // session is in the other one); the session works and is not deleted (#711).
  it('does not call a session deleted when it is in another project folder', async () => {
    mkdirSync(join(configDir, 'projects', '-other-project'), { recursive: true });
    writeFileSync(join(configDir, 'projects', '-other-project', 'started-for-b.jsonl'), '{}\n');

    await getSessionsExistHandler('c', message({ sessionIds: ['started-for-b', 'gone'], workingDir: '/w' }), connections, {} as never);

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
