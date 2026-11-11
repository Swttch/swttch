import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  RUNNING_FRESH_MS,
  readDesktopState,
  readDesktopStarters,
  resetDesktopSessionsCache,
  watchDesktopState,
} from '../desktopSessions';

/**
 * The Claude desktop app keeps a JSON file per session. A session another one started names it in
 * `spawnedFrom.sessionId` (the desktop app's own id); `cliSessionId` is the id the lists are keyed by.
 */
describe('desktop app sessions', () => {
  let root: string;

  beforeEach(async () => {
    resetDesktopSessionsCache();
    root = await mkdtemp(join(tmpdir(), 'desktop-sessions-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeSession(name: string, file: Record<string, unknown>, mtime?: number): Promise<void> {
    const dir = join(root, 'account', 'workspace');
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${name}.json`);
    await writeFile(path, JSON.stringify(file));
    if (mtime !== undefined) await utimes(path, mtime, mtime);
  }

  it('answers nothing on a machine without the desktop app', async () => {
    expect((await readDesktopStarters(join(root, 'missing'))).size).toBe(0);
  });

  it('names, for a session, the CLI id of the session the desktop app says started it', async () => {
    await writeSession('local_m', { sessionId: 'local_m', cliSessionId: 'cli-manager' });
    await writeSession('local_c', { sessionId: 'local_c', cliSessionId: 'cli-child', spawnedFrom: { sessionId: 'local_m', title: 'x' } });

    expect([...(await readDesktopStarters(root))]).toEqual([['cli-child', 'cli-manager']]);
  });

  it('leaves a session at the top level when it was taken there in the desktop app, whoever created it', async () => {
    await writeSession('local_m', { sessionId: 'local_m', cliSessionId: 'cli-manager' });
    await writeSession('local_a', { sessionId: 'local_a', cliSessionId: 'cli-a', spawnedFrom: { sessionId: 'local_m' }, lineageDetached: true, lineageDetachedBy: 'agent' });
    await writeSession('local_b', { sessionId: 'local_b', cliSessionId: 'cli-b', spawnedFrom: { sessionId: 'local_m' }, lineageDetached: false });

    expect([...(await readDesktopStarters(root))]).toEqual([['cli-b', 'cli-manager']]);
  });

  it('leaves out a pair when either side never ran, or the starter is not on this machine', async () => {
    await writeSession('local_m', { sessionId: 'local_m' });
    await writeSession('local_a', { sessionId: 'local_a', cliSessionId: 'cli-a', spawnedFrom: { sessionId: 'local_m' } });
    await writeSession('local_b', { sessionId: 'local_b', cliSessionId: 'cli-b', spawnedFrom: { sessionId: 'local_gone' } });

    expect((await readDesktopStarters(root)).size).toBe(0);
  });

  it('skips a file that is not JSON and keeps the rest', async () => {
    await mkdir(join(root, 'account'), { recursive: true });
    await writeFile(join(root, 'account', 'local_broken.json'), '{"sessionId": "local_br');
    await writeSession('local_m', { sessionId: 'local_m', cliSessionId: 'cli-manager' });
    await writeSession('local_c', { sessionId: 'local_c', cliSessionId: 'cli-child', spawnedFrom: { sessionId: 'local_m' } });

    expect((await readDesktopStarters(root)).get('cli-child')).toBe('cli-manager');
  });

  it('reads a file again when it changed', async () => {
    await writeSession('local_m', { sessionId: 'local_m', cliSessionId: 'cli-manager' });
    await writeSession('local_c', { sessionId: 'local_c', cliSessionId: 'cli-child', spawnedFrom: { sessionId: 'local_m' } }, 1000);
    expect((await readDesktopStarters(root)).get('cli-child')).toBe('cli-manager');

    await writeSession('local_c', { sessionId: 'local_c', cliSessionId: 'cli-child' }, 2000);
    expect((await readDesktopStarters(root)).has('cli-child')).toBe(false);
  });

  it('lists the sessions archived in the desktop app by their CLI id', async () => {
    await writeSession('local_a', { sessionId: 'local_a', cliSessionId: 'cli-a', isArchived: true });
    await writeSession('local_b', { sessionId: 'local_b', cliSessionId: 'cli-b', isArchived: false });
    await writeSession('local_c', { sessionId: 'local_c', isArchived: true });

    expect([...(await readDesktopState(root)).archived]).toEqual(['cli-a']);
  });

  it('announces an archive or a restore', async () => {
    await writeSession('local_a', { sessionId: 'local_a', cliSessionId: 'cli-a', isArchived: false });
    let announced = 0;
    const stop = watchDesktopState(() => announced++, root, 20);
    try {
      await new Promise((r) => setTimeout(r, 150));
      await writeSession('local_a', { sessionId: 'local_a', cliSessionId: 'cli-a', isArchived: true });
      await new Promise((r) => setTimeout(r, 300));
      expect(announced).toBe(1);
    } finally {
      stop();
    }
  });

  it('announces a change of who started whom, and not a change that reads to the same answer', async () => {
    await writeSession('local_m', { sessionId: 'local_m', cliSessionId: 'cli-manager' });
    await writeSession('local_c', { sessionId: 'local_c', cliSessionId: 'cli-child', title: 'one' });
    let announced = 0;
    const stop = watchDesktopState(() => announced++, root, 20);
    try {
      await new Promise((r) => setTimeout(r, 150));

      await writeSession('local_c', { sessionId: 'local_c', cliSessionId: 'cli-child', title: 'one', model: 'other' });
      await new Promise((r) => setTimeout(r, 250));
      expect(announced).toBe(0);

      await writeSession('local_c', { sessionId: 'local_c', cliSessionId: 'cli-child', spawnedFrom: { sessionId: 'local_m' } });
      await new Promise((r) => setTimeout(r, 300));
      expect(announced).toBe(1);
    } finally {
      stop();
    }
  });

  it('announces a rename, as a change to the list and not to what is running', async () => {
    await writeSession('local_c', { sessionId: 'local_c', cliSessionId: 'cli-child', title: 'one' });
    const changes: { list: boolean; running: boolean }[] = [];
    const stop = watchDesktopState((_state, change) => changes.push(change), root, 20);
    try {
      await new Promise((r) => setTimeout(r, 150));
      await writeSession('local_c', { sessionId: 'local_c', cliSessionId: 'cli-child', title: 'renamed' });
      await new Promise((r) => setTimeout(r, 300));
      expect(changes).toEqual([{ list: true, running: false }]);
    } finally {
      stop();
    }
  });

  describe('running turns', () => {
    const now = () => Date.now();

    it('takes a user message newer than the last turn end as a turn in flight', async () => {
      await writeSession('local_r', {
        sessionId: 'local_r', cliSessionId: 'cli-run', lastActivityAt: now(), latestUserFrameAt: now(), lastTurnEdgeAt: now() - 5000,
      });
      await writeSession('local_i', {
        sessionId: 'local_i', cliSessionId: 'cli-idle', lastActivityAt: now(), latestUserFrameAt: now() - 5000, lastTurnEdgeAt: now(),
      });
      await writeSession('local_n', { sessionId: 'local_n', cliSessionId: 'cli-never', lastActivityAt: now(), latestUserFrameAt: now() });
      expect([...(await readDesktopState(root)).running].sort()).toEqual(['cli-never', 'cli-run']);
    });

    it('does not count a turn that was cut off and has been silent for long', async () => {
      await writeSession('local_s', {
        sessionId: 'local_s', cliSessionId: 'cli-stale', lastActivityAt: now() - RUNNING_FRESH_MS - 1000, latestUserFrameAt: now() - RUNNING_FRESH_MS - 1000,
      });
      expect((await readDesktopState(root)).running.size).toBe(0);
    });

    it('announces a turn that starts and one that ends, and already knows one running at the first look', async () => {
      await writeSession('local_r', {
        sessionId: 'local_r', cliSessionId: 'cli-run', lastActivityAt: now(), latestUserFrameAt: now(), lastTurnEdgeAt: now() - 5000,
      });
      const seen: { running: string[]; list: boolean; changed: boolean }[] = [];
      const stop = watchDesktopState(
        (state, change) => seen.push({ running: [...state.running], list: change.list, changed: change.running }),
        root,
        20,
      );
      try {
        await new Promise((r) => setTimeout(r, 150));
        expect(seen).toEqual([{ running: ['cli-run'], list: false, changed: true }]);
        await writeSession('local_r', {
          sessionId: 'local_r', cliSessionId: 'cli-run', lastActivityAt: now(), latestUserFrameAt: now() - 1000, lastTurnEdgeAt: now(),
        });
        await new Promise((r) => setTimeout(r, 300));
        expect(seen[1]).toEqual({ running: [], list: false, changed: true });
      } finally {
        stop();
      }
    });
  });
});
