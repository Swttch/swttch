import { execFileSync, type ChildProcess } from 'child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, join } from 'path';

/**
 * On-disk registry of live chat CLI processes.
 *
 * The process-group hard-binding covers every backend death that still runs
 * JS, but a hard SIGKILL of the backend bypasses all of it — the CLI survives as
 * an orphan, invisible to any later backend. This registry closes that loop: every chat CLI spawn writes a small
 * entry file, every clean CLI exit removes it, and a fresh backend can then
 * (a) sweep orphans at startup and (b) refuse/kill a conflicting live writer
 * before `--resume` (two CLIs appending to one session JSONL branch its history
 * and emit false task verdicts).
 *
 * Layout: one JSON file per CLI pid under ~/.claude-code-gui/cli-registry/.
 * Per-entry files avoid read-modify-write races between concurrently running
 * backends (JetBrains mode legitimately runs one backend per project).
 *
 * PID reuse safety: a pid alone is not an identity. Before acting on an entry we
 * re-read the live process argv (`ps -o args=` on POSIX, the CIM `Win32_Process`
 * CommandLine on win32) and require it to still contain the entry's sessionId (the
 * chat spawn always passes `--session-id <id>` or `--resume <id>`). If the argv is
 * unreadable (e.g. a transient CIM failure) identity stays unknown and nothing is
 * auto-killed — the conservative fallback, never a reused pid casualty.
 */

export interface CliRegistryEntry {
  pid: number;
  sessionId: string;
  workingDir: string;
  startedAt: string;
  /** The backend that spawned the CLI; argv1 lets liveness checks survive pid reuse. */
  owner: { pid: number; argv1: string };
}

function registryDir(): string {
  return join(homedir(), '.claude-code-gui', 'cli-registry');
}

/** Live argv of [pid] as one string, or null when unknown (dead pid / unreadable). */
function processArgs(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  if (process.platform === 'win32') {
    try {
      // Win32_Process.CommandLine is the full argv (incl. --session-id / --resume),
      // the identity token our PID-reuse guard needs. `tasklist` only yields the
      // image name, so it cannot verify identity. CIM is the portable, non-deprecated
      // path (wmic is being removed from Windows). Empty output = pid gone / no argv.
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ],
        { encoding: 'utf8', windowsHide: true },
      ).trim();
      return out.length > 0 ? out : null;
    } catch {
      return null; // CIM query failed — treat identity as unknown
    }
  }
  try {
    return execFileSync('ps', ['-o', 'args=', '-p', String(pid)], { encoding: 'utf8' }).trim();
  } catch {
    return null; // ps exits non-zero for a dead pid
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Tree kill with plain-signal fallback — pid-based twin of Claude.killTree. */
function killPidTree(pid: number, signal: NodeJS.Signals): void {
  // process.kill(-0)/process.kill(-1) would signal our own (or every) process
  // group — in JetBrains mode that can include the IDE JVM. Never let a corrupt
  // or bogus registry pid reach the group signal.
  if (!Number.isInteger(pid) || pid <= 1) return;
  if (process.platform === 'win32') {
    // No process groups on win32; `taskkill /T` walks the child tree, `/F` forces.
    // `signal` is irrelevant here (taskkill always terminates) — both the SIGTERM
    // and the escalated SIGKILL caller in killRegisteredCli map to the same tree
    // kill. That collapses the grace ladder to an immediate hard kill, which is
    // correct for an orphan (its owning backend is already gone). taskkill on an
    // already-dead pid exits non-zero and is swallowed by the catch.
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true });
    } catch {
      // Already gone or not killable — ignore
    }
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already gone
    }
  }
}

/**
 * win32 only: pids of every LIVE process whose argv carries [sessionId]. The chat
 * spawn wraps `claude` in a cmd.exe shell (win32 needs a shell to resolve the
 * `.cmd`/`.ps1` launcher), so the pid the registry stored is the SHELL. When the
 * backend dies the shell drops with the broken stdio pipe, but the real `claude`
 * grandchild keeps running — a working orphan the stored pid can no longer reach.
 * The session id rides in `--session-id`/`--resume`, which BOTH the shell and the
 * grandchild carry in their CommandLine, so matching on it finds the survivor.
 * Excludes our own CIM query (its command text contains the id too).
 */
function liveSessionProcs(sessionId: string): number[] {
  if (process.platform !== 'win32') return [];
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${sessionId}*' -and $_.CommandLine -notlike '*Get-CimInstance*' } | ForEach-Object { $_.ProcessId }`,
      ],
      { encoding: 'utf8', windowsHide: true },
    ).trim();
    if (!out) return [];
    return out
      .split(/\r?\n/)
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 1);
  } catch {
    return [];
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function registerCliProcess(proc: ChildProcess, sessionId: string, workingDir: string): void {
  if (!proc.pid) return;
  const entry: CliRegistryEntry = {
    pid: proc.pid,
    sessionId,
    workingDir,
    startedAt: new Date().toISOString(),
    owner: { pid: process.pid, argv1: process.argv[1] ?? '' },
  };
  try {
    mkdirSync(registryDir(), { recursive: true });
    writeFileSync(join(registryDir(), `${proc.pid}.json`), JSON.stringify(entry, null, 2) + '\n');
  } catch (err) {
    // Best-effort: a failed registry write must never block the chat itself.
    console.error('[node-backend]', 'CLI registry write failed:', err);
  }
}

export function unregisterCliProcess(pid: number | undefined): void {
  if (!pid) return;
  try {
    rmSync(join(registryDir(), `${pid}.json`), { force: true });
  } catch (err) {
    console.error('[node-backend]', 'CLI registry remove failed:', err);
  }
}

function readEntries(): CliRegistryEntry[] {
  let files: string[];
  try {
    files = readdirSync(registryDir()).filter((f) => f.endsWith('.json'));
  } catch {
    return []; // No registry dir yet — clean world
  }
  const entries: CliRegistryEntry[] = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(registryDir(), file), 'utf8')) as CliRegistryEntry;
      if (Number.isInteger(parsed.pid) && parsed.pid > 1 && typeof parsed.sessionId === 'string' && parsed.owner) {
        entries.push(parsed);
      } else {
        rmSync(join(registryDir(), file), { force: true });
      }
    } catch {
      rmSync(join(registryDir(), file), { force: true }); // Corrupt entry — drop it
    }
  }
  return entries;
}

/**
 * Identity-checked liveness of an entry's CLI:
 * 'live' — a live process still carries the sessionId;
 * 'dead' — no live carrier, or the stored pid was reused by an unrelated process.
 *
 * win32 keys on the session id across ALL live processes, not the stored pid: that
 * pid is the cmd.exe shell, which dies with the backend while the real `claude`
 * grandchild orphans on. Keying on the shell pid alone would declare a live orphan
 * 'dead' and leak it. POSIX spawns the CLI directly (no shell) and detached, so the
 * stored pid IS the CLI — argv identity on that pid is exact. A transient argv-read
 * failure resolves to 'dead' (GC the record) rather than risk killing a reused pid.
 */
function cliState(entry: CliRegistryEntry): 'live' | 'dead' {
  if (process.platform === 'win32') {
    return liveSessionProcs(entry.sessionId).length > 0 ? 'live' : 'dead';
  }
  if (!pidAlive(entry.pid)) return 'dead';
  const args = processArgs(entry.pid);
  if (args === null) return 'dead';
  return args.includes(entry.sessionId) ? 'live' : 'dead';
}

/**
 * Is the backend that spawned this CLI still alive (and not us)? Conservative on
 * ambiguity: when the owner pid is alive but its argv is unreadable, assume alive
 * — never kill a CLI that might belong to a living backend.
 */
function ownerAlive(entry: CliRegistryEntry): boolean {
  if (entry.owner.pid === process.pid) return false; // our own stale record
  if (!pidAlive(entry.owner.pid)) return false;
  const args = processArgs(entry.owner.pid);
  if (args === null) return true;
  const hint = basename(entry.owner.argv1 || '');
  return hint === '' || args.includes(hint);
}

export interface CliConflict {
  entry: CliRegistryEntry;
  ownerAlive: boolean;
}

/**
 * A live, identity-checked CLI already attached to [sessionId], if any.
 * Cleans up dead entries it encounters along the way.
 */
export function findLiveCliForSession(sessionId: string): CliConflict | null {
  for (const entry of readEntries()) {
    if (entry.sessionId !== sessionId) continue;
    const state = cliState(entry);
    if (state === 'dead') {
      unregisterCliProcess(entry.pid);
      continue;
    }
    return { entry, ownerAlive: ownerAlive(entry) };
  }
  return null;
}

/** SIGTERM the entry's process group, escalate to SIGKILL after [graceMs]. */
export async function killRegisteredCli(entry: CliRegistryEntry, graceMs = 3_000): Promise<void> {
  if (process.platform === 'win32') {
    // Kill by session id, not the stored shell pid: `taskkill /F /T` every live
    // carrier — the orphaned `claude` grandchild (and any of its own children).
    // No grace ladder; the owning backend is already gone, so there is nothing to
    // shut down gracefully.
    for (const pid of liveSessionProcs(entry.sessionId)) killPidTree(pid, 'SIGKILL');
    unregisterCliProcess(entry.pid);
    return;
  }
  killPidTree(entry.pid, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline && cliState(entry) === 'live') {
    await delay(100);
  }
  if (cliState(entry) === 'live') {
    console.error('[node-backend]', `Orphaned CLI ${entry.pid} ignored SIGTERM — escalating to SIGKILL`);
    killPidTree(entry.pid, 'SIGKILL');
  }
  unregisterCliProcess(entry.pid);
}

/**
 * Startup orphan sweep: kill every registered CLI whose owning backend is gone.
 * Entries owned by other LIVE backends are left alone (multi-backend setups are
 * legitimate); dead/reused entries are garbage-collected.
 */
export async function sweepOrphanCliProcesses(): Promise<{ killed: number; skipped: number }> {
  let killed = 0;
  let skipped = 0;
  for (const entry of readEntries()) {
    const state = cliState(entry);
    if (state === 'dead') {
      unregisterCliProcess(entry.pid);
      continue;
    }
    if (ownerAlive(entry)) {
      skipped++;
      continue;
    }
    console.error(
      '[node-backend]',
      `Orphan sweep: killing orphaned CLI ${entry.pid} (session ${entry.sessionId}, dead owner ${entry.owner.pid})`,
    );
    await killRegisteredCli(entry);
    killed++;
  }
  if (killed > 0 || skipped > 0) {
    console.error('[node-backend]', `Orphan sweep done: killed ${killed}, skipped ${skipped}`);
  }
  return { killed, skipped };
}
