import { spawn as cpSpawn, type ChildProcess, type SpawnOptions } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * win32 chat-CLI spawn through a Job Object wrapper — the Windows equivalent of the
 * POSIX "detached process-group leader + signal the whole group" design.
 *
 * The problem it solves: `taskkill /F /T` walks the LIVE parent-child tree, but
 * git-bash (MSYS) launches its workers under a fork helper that exits immediately,
 * detaching them from the cmd->claude->bash tree (they even reparent to ppid 1).
 * Windows never reparents to a reaper, so those workers survive every tree-kill as
 * headless orphans that keep running and billing. A Job Object with
 * KILL_ON_JOB_CLOSE keeps every descendant in the job regardless of PPID
 * reparenting; killing the wrapper (or the backend dying) closes the job handle and
 * the kernel tears the whole tree down. See win-job-wrapper.ps1 for the mechanism.
 */

/**
 * The exact `cmd /d /s /c "<...>"` payload. Mirrors Node's own win32 shell:true
 * construction: command + args joined by spaces with NO per-arg re-quoting, wrapped
 * as a single verbatim string by the wrapper. Reproducing that byte-for-byte keeps
 * the CLI's argv identical to the pre-job spawn (chat args are simple tokens).
 */
export function buildWin32CmdLine(command: string, args: string[]): string {
  return [command, ...args].join(' ');
}

/** Absolute path to the shipped wrapper, resolved next to the running bundle. */
export function jobWrapperPath(): string {
  return fileURLToPath(new URL('./win-job-wrapper.ps1', import.meta.url));
}

/**
 * Spawn the chat CLI inside a Job Object. `sessionId` is passed as a wrapper argv
 * token ONLY so the on-disk registry's sessionId-keyed orphan sweep can find and
 * kill this wrapper (its death closes the job). If the wrapper asset is missing for
 * any reason, fall back to the plain shell spawn so chat never breaks — a missing
 * job only reopens the orphan gap, it must never block the user.
 */
export function spawnWin32JobCli(
  command: string,
  args: string[],
  sessionId: string,
  options: SpawnOptions,
): ChildProcess {
  const wrapper = jobWrapperPath();
  if (!existsSync(wrapper)) {
    console.error('[node-backend]', `Job wrapper not found at ${wrapper} — spawning without a job (orphan guard degraded)`);
    return cpSpawn(command, args, { ...options, shell: true });
  }
  const cmdline = buildWin32CmdLine(command, args);
  return cpSpawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper, sessionId],
    { ...options, shell: false, env: { ...options.env, CCG_JOB_CMDLINE: cmdline } },
  );
}
