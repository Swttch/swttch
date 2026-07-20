import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
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

/** A dead-but-real pid: spawn a no-op child and wait for it to exit. */
function deadPid(): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = isPosix ? spawn('true') : spawn(process.execPath, ['-e', '']);
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

  it('drops a registry entry with a bogus pid (<= 1) without ever signalling', async () => {
    // Defence in depth: a corrupt/bogus pid must never reach the group kill.
    // process.kill(-0) signals our OWN process group and process.kill(-1) every
    // group we may signal — in JetBrains mode that can include the IDE JVM.
    mkdirSync(registryDir(), { recursive: true });
    const bogus = join(registryDir(), '0.json');
    writeFileSync(
      bogus,
      JSON.stringify({
        pid: 0,
        sessionId: 'sess-bogus',
        workingDir: '/tmp/proj',
        startedAt: new Date().toISOString(),
        owner: { pid: 999999, argv1: 'node' },
      }),
    );

    const killSpy = vi.spyOn(process, 'kill');
    const result = await sweepOrphanCliProcesses();
    const groupSignals = killSpy.mock.calls.filter(([p]) => typeof p === 'number' && p <= 0);
    killSpy.mockRestore();

    // readEntries rejects pid <= 1 up front, so the sweep never sees it, never
    // signals a group, and GCs the corrupt file.
    expect(groupSignals).toEqual([]);
    expect(result).toEqual({ killed: 0, skipped: 0 });
    expect(existsSync(bogus)).toBe(false);
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

// ── win32 (real processes) ───────────────────────────────────────────────────
// The POSIX suite proves identity/kill via `ps` + group signals; neither exists
// on win32. Here identity shells out to CIM (Win32_Process.CommandLine) and kills
// go through `taskkill /F /T` — the exact paths cli-registry takes on win32, so
// mocks could not prove them. CIM spins up powershell per query, so these are slow;
// each test carries a generous timeout.
const WIN_TIMEOUT = 30_000;

/**
 * A live CLI stand-in whose argv carries [marker] the way the real chat spawn
 * carries `--session-id <id>`. node stays alive on setInterval; the marker rides
 * AFTER `--` so node won't parse it as an option, and CIM's CommandLine reads it
 * back — the token the registry's identity check matches on.
 */
function spawnMarkedWin(marker: string): ChildProcess {
  return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', '--session-id', marker], {
    stdio: 'ignore',
  });
}

function taskkillTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true });
  } catch {
    // Already gone
  }
}

describe.skipIf(isPosix)('cli-registry (win32, real processes)', () => {
  const spawned: ChildProcess[] = [];

  beforeEach(() => {
    fakeHome = mkdtempSync(join(process.env.TEMP ?? process.env.TMPDIR ?? '.', 'cli-registry-test-'));
  });

  afterEach(() => {
    for (const proc of spawned) taskkillTree(proc.pid);
    spawned.length = 0;
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it(
    'finds a live orphan (dead owner) for its session via CIM identity',
    async () => {
      const proc = spawnMarkedWin('sess-orphan-win');
      spawned.push(proc);
      registerCliProcess(proc, 'sess-orphan-win', 'C:/tmp/proj');
      tamperOwner(proc.pid as number, { pid: await deadPid(), argv1: 'node.exe' });

      const conflict = findLiveCliForSession('sess-orphan-win');
      expect(conflict?.entry.pid).toBe(proc.pid);
      expect(conflict?.ownerAlive).toBe(false);
    },
    WIN_TIMEOUT,
  );

  it(
    'reports ownerAlive for an entry owned by a live process',
    () => {
      const proc = spawnMarkedWin('sess-owned-win');
      spawned.push(proc);
      const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      spawned.push(owner);
      registerCliProcess(proc, 'sess-owned-win', 'C:/tmp/proj');
      tamperOwner(proc.pid as number, { pid: owner.pid as number, argv1: process.execPath });

      const conflict = findLiveCliForSession('sess-owned-win');
      expect(conflict?.ownerAlive).toBe(true);
    },
    WIN_TIMEOUT,
  );

  it(
    'treats a pid whose argv lost the sessionId as dead (pid reuse) and GCs the entry',
    () => {
      const proc = spawnMarkedWin('some-other-marker-win');
      spawned.push(proc);
      registerCliProcess(proc, 'sess-reused-win', 'C:/tmp/proj');

      expect(findLiveCliForSession('sess-reused-win')).toBeNull();
      expect(existsSync(entryPath(proc.pid as number))).toBe(false);
    },
    WIN_TIMEOUT,
  );

  it(
    'killRegisteredCli tears down the orphan tree via taskkill',
    async () => {
      const proc = spawnMarkedWin('sess-kill-win');
      spawned.push(proc);
      registerCliProcess(proc, 'sess-kill-win', 'C:/tmp/proj');
      const entry = JSON.parse(readFileSync(entryPath(proc.pid as number), 'utf8')) as CliRegistryEntry;

      await killRegisteredCli(entry, 3_000);

      await waitUntil(() => !pidAlive(proc.pid as number), 10_000);
      expect(existsSync(entryPath(proc.pid as number))).toBe(false);
    },
    WIN_TIMEOUT,
  );

  it(
    'drops a registry entry with a bogus pid (<= 1) without ever killing',
    async () => {
      mkdirSync(registryDir(), { recursive: true });
      const bogus = join(registryDir(), '0.json');
      writeFileSync(
        bogus,
        JSON.stringify({
          pid: 0,
          sessionId: 'sess-bogus-win',
          workingDir: 'C:/tmp/proj',
          startedAt: new Date().toISOString(),
          owner: { pid: 999999, argv1: 'node.exe' },
        }),
      );

      const result = await sweepOrphanCliProcesses();

      // readEntries rejects pid <= 1 up front: never swept, GC'd instead.
      expect(result).toEqual({ killed: 0, skipped: 0 });
      expect(existsSync(bogus)).toBe(false);
    },
    WIN_TIMEOUT,
  );

  it(
    'sweep kills orphans, skips live-owner entries, and GCs dead ones',
    async () => {
      const orphan = spawnMarkedWin('sess-sweep-orphan-win');
      spawned.push(orphan);
      registerCliProcess(orphan, 'sess-sweep-orphan-win', 'C:/tmp/proj');
      tamperOwner(orphan.pid as number, { pid: await deadPid(), argv1: 'node.exe' });

      const owned = spawnMarkedWin('sess-sweep-owned-win');
      spawned.push(owned);
      const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      spawned.push(owner);
      registerCliProcess(owned, 'sess-sweep-owned-win', 'C:/tmp/proj');
      tamperOwner(owned.pid as number, { pid: owner.pid as number, argv1: process.execPath });

      const gone = spawnMarkedWin('sess-sweep-dead-win');
      registerCliProcess(gone, 'sess-sweep-dead-win', 'C:/tmp/proj');
      taskkillTree(gone.pid);
      await waitUntil(() => !pidAlive(gone.pid as number), 10_000);

      const result = await sweepOrphanCliProcesses();

      expect(result).toEqual({ killed: 1, skipped: 1 });
      await waitUntil(() => !pidAlive(orphan.pid as number), 10_000);
      expect(pidAlive(owned.pid as number)).toBe(true);
      expect(existsSync(entryPath(orphan.pid as number))).toBe(false);
      expect(existsSync(entryPath(gone.pid as number))).toBe(false);
      expect(existsSync(entryPath(owned.pid as number))).toBe(true);
    },
    WIN_TIMEOUT,
  );
});
