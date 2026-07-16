import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

// The registry lives under homedir()/.claude-code-gui — point homedir at a scratch
// dir so tests never touch the real user registry.
let fakeHome: string;
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => fakeHome };
});

import {
  registerCliProcess,
  unregisterCliProcess,
  findLiveCliForSession,
  killRegisteredCli,
  sweepOrphanCliProcesses,
  type CliRegistryEntry,
} from '../cli-registry';

// Real-process tests (like kill-tree.integration.test.ts): identity checks shell
// out to `ps` and kills are real group signals — mocks cannot prove either.
const isPosix = process.platform !== 'win32';

const registryDir = () => join(fakeHome, '.claude-code-gui', 'cli-registry');
const entryPath = (pid: number) => join(registryDir(), `${pid}.json`);

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(cond: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('condition not met within timeout');
}

/** A dead-but-real pid: spawn `true` and wait for it to exit. */
function deadPid(): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('true');
    proc.on('error', reject);
    proc.on('exit', () => resolve(proc.pid as number));
  });
}

/**
 * Spawn a CLI stand-in whose argv carries [marker] (the `sh -c` $0 slot), the
 * way the real chat spawn carries `--session-id <id>` — that argv marker is what
 * the registry's identity check reads back via `ps`. The script must be a
 * multi-command one: for a single command `sh -c` exec-optimizes itself away and
 * the marker-bearing shell argv disappears from `ps`.
 */
function spawnMarked(marker: string, script = 'sleep 30; true'): ChildProcess {
  return spawn('sh', ['-c', script, marker], { detached: true, stdio: 'ignore' });
}

function tamperOwner(pid: number, owner: { pid: number; argv1: string }): void {
  const entry = JSON.parse(readFileSync(entryPath(pid), 'utf8')) as CliRegistryEntry;
  entry.owner = owner;
  writeFileSync(entryPath(pid), JSON.stringify(entry));
}

describe.skipIf(!isPosix)('cli-registry (POSIX, real processes)', () => {
  const spawned: ChildProcess[] = [];

  beforeEach(() => {
    fakeHome = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'cli-registry-test-'));
  });

  afterEach(() => {
    for (const proc of spawned) {
      if (proc.pid) {
        try {
          process.kill(-proc.pid, 'SIGKILL');
        } catch {
          // Not a leader or already gone
        }
      }
      try {
        proc.kill('SIGKILL');
      } catch {
        // Already gone
      }
    }
    spawned.length = 0;
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('register writes an entry file, unregister removes it', () => {
    const proc = spawnMarked('sess-lifecycle');
    spawned.push(proc);
    registerCliProcess(proc, 'sess-lifecycle', '/tmp/proj');

    expect(existsSync(entryPath(proc.pid as number))).toBe(true);
    const entry = JSON.parse(readFileSync(entryPath(proc.pid as number), 'utf8')) as CliRegistryEntry;
    expect(entry.sessionId).toBe('sess-lifecycle');
    expect(entry.owner.pid).toBe(process.pid);

    unregisterCliProcess(proc.pid);
    expect(existsSync(entryPath(proc.pid as number))).toBe(false);
  });

  it('finds a live orphan (dead owner) for its session', async () => {
    const proc = spawnMarked('sess-orphan');
    spawned.push(proc);
    registerCliProcess(proc, 'sess-orphan', '/tmp/proj');
    tamperOwner(proc.pid as number, { pid: await deadPid(), argv1: 'node' });

    const conflict = findLiveCliForSession('sess-orphan');
    expect(conflict?.entry.pid).toBe(proc.pid);
    expect(conflict?.ownerAlive).toBe(false);
  });

  it('reports ownerAlive for an entry owned by a live process', () => {
    const proc = spawnMarked('sess-owned');
    spawned.push(proc);
    const owner = spawn('sleep', ['30'], { stdio: 'ignore' });
    spawned.push(owner);
    registerCliProcess(proc, 'sess-owned', '/tmp/proj');
    tamperOwner(proc.pid as number, { pid: owner.pid as number, argv1: '/usr/bin/sleep' });

    const conflict = findLiveCliForSession('sess-owned');
    expect(conflict?.ownerAlive).toBe(true);
  });

  it('treats a pid whose argv lost the sessionId as dead (pid reuse) and GCs the entry', () => {
    // The live process argv carries a DIFFERENT marker than the registered session.
    const proc = spawnMarked('some-other-marker');
    spawned.push(proc);
    registerCliProcess(proc, 'sess-reused', '/tmp/proj');

    expect(findLiveCliForSession('sess-reused')).toBeNull();
    expect(existsSync(entryPath(proc.pid as number))).toBe(false);
  });

  it('killRegisteredCli escalates to SIGKILL when SIGTERM is ignored', async () => {
    const proc = spawnMarked('sess-stubborn', 'trap "" TERM; sleep 30 & wait');
    spawned.push(proc);
    registerCliProcess(proc, 'sess-stubborn', '/tmp/proj');
    const entry = JSON.parse(readFileSync(entryPath(proc.pid as number), 'utf8')) as CliRegistryEntry;

    await killRegisteredCli(entry, 500);

    await waitUntil(() => !pidAlive(proc.pid as number));
    expect(existsSync(entryPath(proc.pid as number))).toBe(false);
  });

  it('sweep kills orphans, skips live-owner entries, and GCs dead ones', async () => {
    const orphan = spawnMarked('sess-sweep-orphan');
    spawned.push(orphan);
    registerCliProcess(orphan, 'sess-sweep-orphan', '/tmp/proj');
    tamperOwner(orphan.pid as number, { pid: await deadPid(), argv1: 'node' });

    const owned = spawnMarked('sess-sweep-owned');
    spawned.push(owned);
    const owner = spawn('sleep', ['30'], { stdio: 'ignore' });
    spawned.push(owner);
    registerCliProcess(owned, 'sess-sweep-owned', '/tmp/proj');
    tamperOwner(owned.pid as number, { pid: owner.pid as number, argv1: '/usr/bin/sleep' });

    const gone = spawnMarked('sess-sweep-dead');
    registerCliProcess(gone, 'sess-sweep-dead', '/tmp/proj');
    process.kill(-(gone.pid as number), 'SIGKILL');
    await waitUntil(() => !pidAlive(gone.pid as number));

    const result = await sweepOrphanCliProcesses();

    expect(result).toEqual({ killed: 1, skipped: 1 });
    await waitUntil(() => !pidAlive(orphan.pid as number));
    expect(pidAlive(owned.pid as number)).toBe(true);
    expect(existsSync(entryPath(orphan.pid as number))).toBe(false);
    expect(existsSync(entryPath(gone.pid as number))).toBe(false);
    expect(existsSync(entryPath(owned.pid as number))).toBe(true);
  });
});
