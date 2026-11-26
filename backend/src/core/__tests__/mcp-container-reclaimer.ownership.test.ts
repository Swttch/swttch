import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  attachMcpContainerReclaim,
  drainMcpContainerReclaims,
  reclaimContainers,
  reclaimLiveMcpContainers,
  recordMcpWatch,
  removeContainersById,
} from '../mcp-container-reclaimer';

// A fake daemon: which containers exist, and which of them were removed.
const daemon = vi.hoisted(() => ({
  containers: new Map<string, { image: string; command: string }>(),
  removed: [] as string[],
}));

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: vi.fn(
    (
      _file: string,
      args: string[],
      _options: unknown,
      done: (error: Error | null, result?: { stdout: string; stderr: string }) => void,
    ) => {
      const answer = (stdout: string) => done(null, { stdout, stderr: '' });
      if (args[0] === 'ps') {
        const image = args[args.length - 1].replace('ancestor=', '');
        answer([...daemon.containers].filter(([, c]) => c.image === image).map(([id]) => id).join('\n'));
      } else if (args[0] === 'inspect') {
        const found = daemon.containers.get(args[1]);
        if (found) answer(`${found.image}\t${found.command}\n`);
        else done(new Error('No such object'));
      } else {
        daemon.containers.delete(args[2]);
        daemon.removed.push(args[2]);
        answer('');
      }
    },
  ),
}));

vi.mock('../features/mcp-config-files', () => ({
  collectMcpServerConfigs: vi.fn(async () => [{ command: 'docker', args: ['run', 'img/db', 'serve'] }]),
}));

const server = { image: 'img/db', command: 'serve' };
// Two processes that are certainly alive, standing in for other chats' CLIs, and one that is not.
const ALIVE = process.pid;
const ALSO_ALIVE = process.ppid;
const DEAD = 2_000_000_001;

let home: string;
const entryFile = (pid: number) => join(home, 'cli-registry', `${pid}.json`);

/** A registry entry as a chat CLI of any backend on this machine leaves it. */
function chat(pid: number, { existing, noted = [], image = 'img/db' }: { existing: string[] | null; noted?: string[]; image?: string }) {
  writeFileSync(
    entryFile(pid),
    JSON.stringify({
      pid,
      sessionId: `sess-${pid}`,
      workingDir: '/work',
      startedAt: new Date().toISOString(),
      owner: { pid: 1_999_999_999, argv1: 'backend.mjs' },
      mcpContainers: noted,
      mcpWatch: { servers: [{ image, command: 'serve' }], existing },
    }),
  );
}

const containers = (...ids: string[]) => {
  for (const id of ids) daemon.containers.set(id, { ...server });
};
/** The snapshot of a CLI that started when [existing] was all there was. */
const snapshot = (...existing: string[]) => ({
  servers: [server],
  existing: new Set(existing),
  takenAt: Date.now(),
});

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ccg-reclaim-'));
  mkdirSync(join(home, 'cli-registry'), { recursive: true });
  vi.stubEnv('CCG_HOME', home);
  daemon.containers.clear();
  daemon.removed.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

describe('reclaiming beside other chats', () => {
  it('leaves the container of a chat that started later and is still running', async () => {
    containers('mine', 'theirs');
    chat(DEAD, { existing: [], noted: ['mine', 'theirs'] });
    chat(ALIVE, { existing: ['mine'], noted: ['theirs'] });

    await expect(reclaimContainers(snapshot(), DEAD)).resolves.toEqual(['mine']);
    expect(daemon.removed).toEqual(['mine']);
  });

  it('still removes its own while an older chat that never saw it is running', async () => {
    containers('older', 'mine');
    chat(ALIVE, { existing: [], noted: ['older'] });
    chat(DEAD, { existing: ['older'], noted: ['mine'] });

    await expect(reclaimContainers(snapshot('older'), DEAD)).resolves.toEqual(['mine']);
  });

  it('leaves what two chats both saw starting, since neither can be sure of it', async () => {
    containers('either');
    chat(DEAD, { existing: [], noted: ['either'] });
    chat(ALIVE, { existing: [], noted: ['either'] });

    await expect(reclaimContainers(snapshot(), DEAD)).resolves.toEqual([]);
  });

  it('leaves one nobody saw starting, which an older chat may have restarted', async () => {
    containers('late');
    chat(ALIVE, { existing: [] });
    chat(DEAD, { existing: [] });

    await expect(reclaimContainers(snapshot(), DEAD)).resolves.toEqual([]);
  });

  it('leaves one a chat could have started when that chat could not list the containers', async () => {
    containers('mine', 'unsure');
    chat(DEAD, { existing: [], noted: ['mine'] });
    chat(ALIVE, { existing: null });

    await expect(reclaimContainers(snapshot(), DEAD)).resolves.toEqual(['mine']);
  });

  it('ignores a chat that has ended and a chat that runs a different server', async () => {
    containers('mine');
    chat(DEAD, { existing: [] });
    chat(DEAD + 1, { existing: [], noted: ['mine'] });
    chat(ALIVE, { existing: [], noted: ['mine'], image: 'img/other' });

    await expect(reclaimContainers(snapshot(), DEAD)).resolves.toEqual(['mine']);
  });

  it('is cleaned up by the last chat that could have started it', async () => {
    containers('late');
    chat(ALIVE, { existing: [] });

    await expect(reclaimContainers(snapshot(), ALIVE)).resolves.toEqual(['late']);
  });
});

describe('reclaiming for a command that is not a chat', () => {
  it('removes what appeared while it ran, past a chat that was already running', async () => {
    chat(ALIVE, { existing: [] });
    const taken = { ...snapshot(), takenAt: Date.now() + 1_000 };
    containers('probe');

    await expect(reclaimContainers(taken)).resolves.toEqual(['probe']);
  });

  it('leaves what a chat that started during it could have started', async () => {
    const taken = { ...snapshot(), takenAt: Date.now() - 1_000 };
    chat(ALIVE, { existing: [] });
    containers('theirs');

    await expect(reclaimContainers(taken)).resolves.toEqual([]);
  });
});

describe('the sweep of a backend starting up', () => {
  it('leaves a recorded container that a running chat could have started', async () => {
    containers('dead-only', 'shared');
    chat(ALIVE, { existing: ['dead-only'], noted: [] });

    await expect(removeContainersById(['dead-only', 'shared'])).resolves.toEqual(['dead-only']);
  });
});

describe('what a chat leaves for the others to go by', () => {
  const cli = (pid: number) =>
    Object.assign(new EventEmitter(), { pid, exitCode: null, signalCode: null }) as unknown as ChildProcess &
      EventEmitter;

  it('writes the servers it watches and what existed when it started', async () => {
    containers('before');
    chat(DEAD, { existing: [] });
    const proc = cli(DEAD);
    attachMcpContainerReclaim(proc);
    recordMcpWatch(proc);

    await vi.waitFor(() =>
      expect(JSON.parse(readFileSync(entryFile(DEAD), 'utf8')).mcpWatch).toEqual({
        servers: [server],
        existing: ['before'],
      }),
    );
    proc.emit('close', 0);
    await drainMcpContainerReclaims();
  });

  it('does not hold back a shutdown that is ending those chats too', async () => {
    const first = cli(ALIVE);
    const second = cli(ALSO_ALIVE);
    attachMcpContainerReclaim(first);
    attachMcpContainerReclaim(second);
    await new Promise((resolve) => setImmediate(resolve));
    containers('either');
    chat(ALIVE, { existing: [], noted: ['either'] });
    chat(ALSO_ALIVE, { existing: [], noted: ['either'] });

    reclaimLiveMcpContainers();
    await drainMcpContainerReclaims();

    expect(daemon.removed).toContain('either');
    first.emit('close', 0);
    second.emit('close', 0);
    await drainMcpContainerReclaims();
  });
});
