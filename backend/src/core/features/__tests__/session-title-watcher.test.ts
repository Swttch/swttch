import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendFile, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * The CLI records a generated title in the transcript whenever its own model call ends,
 * which can be long after the host stopped waiting for the answer (#638). The watch must
 * show that title however late it comes, and must not need the answer.
 */

let sessionsDir: string;

vi.mock('../getProjectSessionsPath', () => ({
  getProjectSessionsPath: async () => sessionsDir,
}));
vi.mock('../sessionTitleSettings', () => ({
  includeLastPromptInTitles: async () => true,
}));
// Naming a session also reads its marks, which asks whether the session-management package is installed. Asking runs
// the package managers of the machine the test runs on, which takes seconds and is no business of this test.
vi.mock('../../session-mcp', () => ({ isSessionMcpInstalled: async () => false }));

import { stopAllSessionTitleWatchers, watchSessionTitle } from '../session-title-watcher';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';

const broadcastToAll = vi.fn();
const connections = { broadcastToAll } as unknown as ConnectionManager;

const user = JSON.stringify({
  uuid: 'u1',
  parentUuid: null,
  type: 'user',
  timestamp: '2025-01-01T00:00:00Z',
  message: { content: [{ type: 'text', text: 'Fix the login bug' }] },
});
const aiTitle = (value: string) => JSON.stringify({ type: 'ai-title', aiTitle: value, sessionId: 's1' });
const customTitle = (value: string) => JSON.stringify({ type: 'custom-title', customTitle: value, sessionId: 's1' });

beforeEach(async () => {
  vi.clearAllMocks();
  sessionsDir = await mkdtemp(join(tmpdir(), 'session-title-watch-'));
});

afterEach(async () => {
  stopAllSessionTitleWatchers();
  await rm(sessionsDir, { recursive: true, force: true });
});

const transcript = () => join(sessionsDir, 's1.jsonl');

describe('watchSessionTitle', () => {
  it('shows a generated title that is recorded long after the request, with no answer at all', async () => {
    await writeFile(transcript(), `${user}\n`);
    const onAnnounced = vi.fn();

    watchSessionTitle(connections, 's1', '/proj', onAnnounced);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(broadcastToAll).not.toHaveBeenCalled();

    await appendFile(transcript(), `${aiTitle('Login bug')}\n`);

    await vi.waitFor(() => expect(broadcastToAll).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, {
      action: 'rename',
      session: { sessionId: 's1', title: 'Login bug', generated: true },
    });
    expect(onAnnounced).toHaveBeenCalledTimes(1);
  });

  it('shows a title that was already recorded when the watch began', async () => {
    await writeFile(transcript(), `${user}\n${aiTitle('Login bug')}\n`);

    watchSessionTitle(connections, 's1', '/proj', vi.fn());

    await vi.waitFor(() => expect(broadcastToAll).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('waits for a transcript that does not exist yet', async () => {
    watchSessionTitle(connections, 's1', '/proj', vi.fn());
    await new Promise((resolve) => setTimeout(resolve, 600));

    await writeFile(transcript(), `${user}\n${aiTitle('Login bug')}\n`);

    await vi.waitFor(() => expect(broadcastToAll).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('names the session by resolveSessionTitle: a name chosen with /rename still wins, and is not drawn as generated', async () => {
    await writeFile(transcript(), `${user}\n${customTitle('My name')}\n`);
    watchSessionTitle(connections, 's1', '/proj', vi.fn());
    await new Promise((resolve) => setTimeout(resolve, 600));

    await appendFile(transcript(), `${aiTitle('Login bug')}\n`);

    await vi.waitFor(() => expect(broadcastToAll).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, {
      action: 'rename',
      session: { sessionId: 's1', title: 'My name' },
    });
  });

  it('announces once and then stops watching', async () => {
    await writeFile(transcript(), `${user}\n${aiTitle('Login bug')}\n`);
    watchSessionTitle(connections, 's1', '/proj', vi.fn());
    await vi.waitFor(() => expect(broadcastToAll).toHaveBeenCalledTimes(1), { timeout: 4000 });

    await appendFile(transcript(), `${aiTitle('Another')}\n`);
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(broadcastToAll).toHaveBeenCalledTimes(1);
  });
});
