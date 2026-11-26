import { spawn as cpSpawn, type ChildProcess, type SpawnOptions } from 'child_process';
import { consoleSafeExecOptions } from './console-safe';
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
 * Quote one argument for the `cmd /d /s /c` line.
 *
 * cmd.exe is handed the whole line as one string, and the program it starts splits that line
 * back into arguments by the CommandLineToArgvW rules. Without quotes, a space splits one
 * argument into two (a user folder with a space in the `--mcp-config` path, #755), and cmd.exe
 * itself acts on an operator such as `&` or `|`.
 *
 * An argument with no space, quote or operator is passed through untouched, so plain flags stay
 * byte-identical. Any other is wrapped in quotes: a quote inside it is escaped with a backslash,
 * the backslashes before that quote are doubled, and a run of backslashes at the very end is
 * doubled so it cannot escape the closing quote.
 *
 * Two things quotes do not cover. cmd.exe expands `%NAME%` even inside them, and it does not
 * read `\"` as an escaped quote, so an operator in an argument that also holds a quote can still
 * reach it. No chat argument holds a quote, which is one reason the session MCP config is passed
 * as a file path rather than as JSON (see `buildSessionMcpArgs`).
 */
export function quoteWin32Arg(value: string): string {
  if (value.length > 0 && !/[\s"&|<>^()]/.test(value)) return value;
  return '"' + value.replace(/(\\*)"/g, (_, slashes: string) => slashes + slashes + '\\"')
    .replace(/(\\+)$/, (_, slashes: string) => slashes + slashes) + '"';
}

/**
 * The exact `cmd /d /s /c "<...>"` payload: the command, then every argument quoted for
 * cmd.exe, joined by spaces, wrapped as a single verbatim string by the wrapper.
 *
 * The command is not quoted. It is the user's `cliPath` setting, run as typed: it may already
 * carry the user's own quotes, or an argument of its own (`wsl claude`), and quoting it again
 * would stop either from starting.
 */
export function buildWin32CmdLine(command: string, args: string[]): string {
  return [command, ...args.map(quoteWin32Arg)].join(' ');
}

/** Absolute path to the shipped wrapper, resolved next to the running bundle. */
export function jobWrapperPath(): string {
  return fileURLToPath(new URL('./win-job-wrapper.ps1', import.meta.url));
}

/**
 * How long the boot-time PowerShell check may run before it is given up on.
 *
 * Not a guess at how long PowerShell takes: the check ends when the process exits.
 * This only bounds a PowerShell that never exits, which would otherwise hold the
 * backend back from opening its port. The plugin gives up on a backend that has not
 * reported its port within 30 seconds, and that budget is shared with the other boot
 * steps, so this stays well under it.
 */
export const POWERSHELL_CHECK_TIMEOUT_MS = 5_000;

/**
 * Whether the Job Object wrapper can be launched. Settled once at boot by
 * {@link checkPowerShell}; chat spawns only read it.
 *
 * `true` until that check has run, which is the behavior before the check existed:
 * anything that spawns without a boot (a unit test, a script) is not changed by it.
 */
let powerShellUsable = true;

/**
 * Asks whether `powershell.exe` can be launched on this machine, and remembers the
 * answer for every chat spawn after it.
 *
 * A corporate policy can block powershell.exe altogether. The Job Object wrapper is
 * then unavailable, but chat must still start, so {@link spawnWin32JobCli} falls back
 * to the plain shell spawn it already uses when the wrapper asset is missing.
 *
 * Run it before the server opens its port and await it: the answer is then known
 * before the first chat can ask for it. A PowerShell that is blocked, fails, or does
 * not exit within {@link POWERSHELL_CHECK_TIMEOUT_MS} all count as unusable.
 *
 * @param env The environment chat will spawn with, because `powershell.exe` is found
 *   through its PATH.
 */
export async function checkPowerShell(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const reason = await new Promise<string | null>((resolve) => {
    let child: ChildProcess;
    try {
      child = cpSpawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
        env,
        timeout: POWERSHELL_CHECK_TIMEOUT_MS,
      });
    } catch (err) {
      // `spawn UNKNOWN` is thrown here rather than reported as an event.
      resolve(describeFailure(err));
      return;
    }
    child.once('error', (err) => resolve(describeFailure(err)));
    child.once('exit', (code, signal) => {
      if (code === 0) resolve(null);
      else if (signal || child.killed) resolve(`did not exit within ${POWERSHELL_CHECK_TIMEOUT_MS}ms`);
      else resolve(`exited with code ${code}`);
    });
  });
  powerShellUsable = reason === null;
  if (reason !== null) {
    console.error('[node-backend]', `PowerShell is unavailable (${reason}) — chat will start without a job (orphan guard degraded)`);
  }
  return powerShellUsable;
}

/**
 * Whether `powershell.exe` can be launched, as {@link checkPowerShell} settled it at boot.
 *
 * For anything that would shell out to PowerShell on the way to opening the port: a
 * PowerShell that never exits would hold such a call, and with it the backend, forever.
 */
export function isPowerShellUsable(): boolean {
  return powerShellUsable;
}

/**
 * Stops a feature that is about to start PowerShell when the boot check found it cannot be
 * launched, with a message the person can read where the feature reports its error.
 *
 * Without it the feature starts PowerShell anyway and fails with `spawn UNKNOWN`, which says
 * nothing about why, or waits for a PowerShell that never answers. `what` is the thing the
 * person was trying to do, as a noun phrase ("Playing a sound").
 */
export function assertPowerShellUsable(what: string): void {
  if (!powerShellUsable) {
    throw new Error(`${what} needs PowerShell, which cannot be launched on this computer.`);
  }
}

function describeFailure(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code ? `spawn ${code}` : String(err);
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
  const cmdline = buildWin32CmdLine(command, args);
  const wrapper = jobWrapperPath();
  // Node joins these with spaces and quotes nothing, so the arguments are quoted here and the
  // line cmd.exe receives is the same one the wrapper would have run.
  const spawnWithoutJob = () =>
    cpSpawn(command, args.map(quoteWin32Arg), { ...consoleSafeExecOptions(options), shell: true });
  if (!existsSync(wrapper)) {
    console.error('[node-backend]', `Job wrapper not found at ${wrapper} — spawning without a job (orphan guard degraded)`);
    return spawnWithoutJob();
  }
  if (!powerShellUsable) {
    return spawnWithoutJob();
  }
  return cpSpawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper, sessionId],
    { ...consoleSafeExecOptions(options), shell: false, env: { ...options.env, CCG_JOB_CMDLINE: cmdline } },
  );
}

/** Absolute path to the shipped BASH_ENV script, resolved next to the running bundle. */
export function bashEnvScriptPath(): string {
  return fileURLToPath(new URL('./win-bash-env.sh', import.meta.url));
}

/**
 * Rewrite a win32 path into the MSYS form git-bash understands (`C:\a\b` -> `/c/a/b`).
 * bash reads $BASH_ENV with its own path rules, so a drive-letter path would not resolve.
 */
export function toMsysPath(win32Path: string): string {
  const drive = /^([A-Za-z]):[\\/]/.exec(win32Path);
  if (!drive) return win32Path.split('\\').join('/');
  return `/${drive[1].toLowerCase()}/${win32Path.slice(3).split('\\').join('/')}`;
}

/**
 * The BASH_ENV overrides that make the CLI's Bash tool emit UTF-8 (see win-bash-env.sh).
 *
 * Returns nothing off win32, or when the script is missing — a missing script must never
 * break chat, it only lets the garbling back in. Any BASH_ENV the user already set is
 * carried in CCG_PREV_BASH_ENV so the script can source it instead of silently dropping it.
 */
export function utf8BashEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') return {};
  const script = bashEnvScriptPath();
  if (!existsSync(script)) return {};
  const previous = env.BASH_ENV;
  return {
    ...(previous ? { CCG_PREV_BASH_ENV: previous } : {}),
    BASH_ENV: toMsysPath(script),
  };
}
