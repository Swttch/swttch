import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, readFile, readdir, writeFile, chmod } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../../features/getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

import { forkSessionHandler } from '../forkSession';
import { getProjectSessionsPath } from '../../features/getProjectSessionsPath';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockGetPath = vi.mocked(getProjectSessionsPath);
const mockBridge = {} as Bridge;

function createMockConnections() {
  return {
    sendTo: vi.fn(),
    broadcastToAll: vi.fn(),
  } as unknown as ConnectionManager;
}

/** The ACK payload the handler answered with. */
function ackOf(connections: ConnectionManager) {
  const sendTo = vi.mocked(connections.sendTo);
  const call = sendTo.mock.calls.find(([, type]) => type === MessageType.ACK);
  return call?.[2] as { status?: string; error?: string; sessionId?: string } | undefined;
}

function user(uuid: string, text: string) {
  return { type: 'user', uuid, message: { role: 'user', content: text } };
}

function assistant(uuid: string, text: string) {
  return { type: 'assistant', uuid, message: { role: 'assistant', content: [{ type: 'text', text }] } };
}

/**
 * A directory holding one session, with [getProjectSessionsPath] pointed at it.
 * Entries are written as given so a test can assert on the exact bytes.
 */
async function writeSession(sessionId: string, entries: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ccg-fork-'));
  await writeFile(
    join(dir, `${sessionId}.jsonl`),
    entries.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry))).join('\n') + '\n',
  );
  mockGetPath.mockResolvedValue(dir);
  return dir;
}

async function fork(connections: ConnectionManager, payload: Record<string, unknown>) {
  const message: IPCMessage = {
    type: MessageType.FORK_SESSION,
    payload,
    timestamp: 0,
    requestId: 'req-1',
  };
  await forkSessionHandler('conn-1', message, connections, mockBridge);
}

/** The transcript of the branch the handler just wrote. */
async function branchLines(dir: string, sessionId: string): Promise<string[]> {
  const text = await readFile(join(dir, `${sessionId}.jsonl`), 'utf8');
  return text.split('\n').filter((line) => line.trim());
}

describe('forkSessionHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('copies the conversation up to the entry before the forked send', async () => {
    const dir = await writeSession('origin', [
      user('u1', 'first question'),
      assistant('a1', 'first answer'),
      user('u2', 'second question'),
      assistant('a2', 'second answer'),
    ]);
    const connections = createMockConnections();

    await fork(connections, { sessionId: 'origin', sendUuid: 'u2', workingDir: '/repo' });

    const ack = ackOf(connections);
    expect(ack?.status).toBe('ok');
    const lines = await branchLines(dir, ack!.sessionId!);
    expect(lines.map((line) => JSON.parse(line).uuid)).toEqual(['u1', 'a1']);
  });

  // The uuids are what `--rewind-files` and `--resume-session-at` name, and the
  // CLI resumes this file afterwards — rewriting them would break both.
  it('copies each line byte for byte', async () => {
    const original = JSON.stringify(user('u1', 'keep me exactly'));
    const dir = await writeSession('origin', [original, user('u2', 'fork here')]);
    const connections = createMockConnections();

    await fork(connections, { sessionId: 'origin', sendUuid: 'u2', workingDir: '/repo' });

    expect(await branchLines(dir, ackOf(connections)!.sessionId!)).toEqual([original]);
  });

  /*
   * Attachments trail the message they belong to, and the CLI refuses one as a
   * resume point ("No message found with message.uuid of: ..."). So the cut lands
   * on the last assistant or user entry rather than simply on the line before the
   * send, and the trailing entries are dropped with it.
   */
  it('cuts at the last message rather than at whatever precedes the send', async () => {
    const dir = await writeSession('origin', [
      user('u1', 'question'),
      assistant('a1', 'answer'),
      { type: 'file-history-snapshot', messageId: 'u1', snapshot: { messageId: 'u1' } },
      { type: 'mode', uuid: 'm1', mode: 'default' },
      user('u2', 'fork here'),
    ]);
    const connections = createMockConnections();

    await fork(connections, { sessionId: 'origin', sendUuid: 'u2', workingDir: '/repo' });

    const lines = await branchLines(dir, ackOf(connections)!.sessionId!);
    expect(lines.map((line) => JSON.parse(line).uuid)).toEqual(['u1', 'a1']);
  });

  it('refuses the send that opens the conversation, which has nothing before it', async () => {
    await writeSession('origin', [user('u1', 'the very first thing'), assistant('a1', 'hi')]);
    const connections = createMockConnections();

    await fork(connections, { sessionId: 'origin', sendUuid: 'u1', workingDir: '/repo' });

    expect(ackOf(connections)?.status).toBe('error');
    expect(vi.mocked(connections.broadcastToAll)).not.toHaveBeenCalled();
  });

  it('answers with a new id rather than the one it branched from', async () => {
    await writeSession('origin', [user('u1', 'a'), assistant('a1', 'b'), user('u2', 'c')]);
    const connections = createMockConnections();

    await fork(connections, { sessionId: 'origin', sendUuid: 'u2', workingDir: '/repo' });

    const { sessionId } = ackOf(connections)!;
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sessionId).not.toBe('origin');
  });

  // The session list is where the user checks that the branch exists.
  it('announces the branch to every client', async () => {
    await writeSession('origin', [user('u1', 'a'), assistant('a1', 'b'), user('u2', 'c')]);
    const connections = createMockConnections();

    await fork(connections, { sessionId: 'origin', sendUuid: 'u2', workingDir: '/repo' });

    expect(vi.mocked(connections.broadcastToAll)).toHaveBeenCalledWith(
      MessageType.SESSIONS_UPDATED,
      { action: 'upsert', session: { sessionId: ackOf(connections)!.sessionId } },
    );
  });

  it('leaves the session it branched from untouched', async () => {
    const entries = [user('u1', 'a'), assistant('a1', 'b'), user('u2', 'c')];
    const dir = await writeSession('origin', entries);
    const before = await readFile(join(dir, 'origin.jsonl'), 'utf8');
    const connections = createMockConnections();

    await fork(connections, { sessionId: 'origin', sendUuid: 'u2', workingDir: '/repo' });

    expect(await readFile(join(dir, 'origin.jsonl'), 'utf8')).toBe(before);
  });

  // Written to a temp file and renamed, so no reader ever sees a half-written
  // transcript. Nothing should be able to tell afterwards that it happened.
  it('leaves no temp file behind', async () => {
    const dir = await writeSession('origin', [user('u1', 'a'), assistant('a1', 'b'), user('u2', 'c')]);
    const connections = createMockConnections();

    await fork(connections, { sessionId: 'origin', sendUuid: 'u2', workingDir: '/repo' });

    expect((await readdir(dir)).filter((name) => name.includes('.tmp'))).toEqual([]);
  });

  it('reports a write failure instead of announcing a branch that is not there', async () => {
    const dir = await writeSession('origin', [user('u1', 'a'), assistant('a1', 'b'), user('u2', 'c')]);
    await chmod(dir, 0o500); // readable, not writable
    const connections = createMockConnections();

    try {
      await fork(connections, { sessionId: 'origin', sendUuid: 'u2', workingDir: '/repo' });

      expect(ackOf(connections)?.status).toBe('error');
      expect(vi.mocked(connections.broadcastToAll)).not.toHaveBeenCalled();
    } finally {
      await chmod(dir, 0o700);
    }
  });

  it('reports a session that is not there rather than throwing', async () => {
    mockGetPath.mockResolvedValue(join(tmpdir(), 'ccg-fork-does-not-exist'));
    const connections = createMockConnections();

    await fork(connections, { sessionId: 'origin', sendUuid: 'u2', workingDir: '/repo' });

    expect(ackOf(connections)?.status).toBe('error');
  });

  /*
   * `sessionId` becomes a path component, so a relative one reads a transcript
   * from outside the sessions directory and copies it into the user's session
   * list. The escape here points at a file that genuinely exists, because a
   * `sessionId` naming something absent fails as "no such file" whether the guard
   * is there or not — such a test passes against no guard at all.
   */
  it('refuses a sessionId that climbs out of the sessions directory', async () => {
    const dir = await writeSession('origin', [user('u1', 'a'), assistant('a1', 'b'), user('u2', 'c')]);
    const outside = await mkdtemp(join(tmpdir(), 'ccg-fork-outside-'));
    await writeFile(
      join(outside, 'secret.jsonl'),
      [JSON.stringify(user('s1', 'not yours')), JSON.stringify(assistant('s2', 'nor this')), JSON.stringify(user('s3', 'cut'))].join('\n') + '\n',
    );
    const connections = createMockConnections();

    await fork(connections, {
      sessionId: join('..', outside.split('/').pop()!, 'secret'),
      sendUuid: 's3',
      workingDir: '/repo',
    });

    expect(ackOf(connections)?.status).toBe('error');
    expect(vi.mocked(connections.broadcastToAll)).not.toHaveBeenCalled();
    // Nothing was written into the session list either.
    expect((await readdir(dir)).sort()).toEqual(['origin.jsonl']);
  });

  it('refuses a sessionId holding a nested path', async () => {
    await writeSession('origin', [user('u1', 'a'), assistant('a1', 'b'), user('u2', 'c')]);
    const connections = createMockConnections();

    await fork(connections, { sessionId: 'sub/dir/origin', sendUuid: 'u2', workingDir: '/repo' });

    expect(ackOf(connections)?.error).toBe('Invalid sessionId');
  });

  describe('refuses an incomplete request', () => {
    const missing = [
      ['sessionId', { sendUuid: 'u2', workingDir: '/repo' }],
      ['sendUuid', { sessionId: 'origin', workingDir: '/repo' }],
      ['workingDir', { sessionId: 'origin', sendUuid: 'u2' }],
    ] as const;

    it.each(missing)('without %s', async (_name, payload) => {
      const connections = createMockConnections();

      await fork(connections, payload);

      expect(ackOf(connections)?.status).toBe('error');
    });
  });
});
