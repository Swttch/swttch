import {
  execFile as cpExecFile,
  type ExecFileOptions,
  type ExecFileOptionsWithBufferEncoding,
} from 'child_process';
import { decodeConsoleOutput } from './console-encoding';

/**
 * Windows-only: run an external launcher through cmd.exe with an argv ARRAY so
 * Node applies its standard CommandLineToArgvW quoting and NO shell tokenization
 * happens on the individual arguments.
 *
 * ## Why this exists (shell-tokenization avoidance — the project's established pattern)
 *
 * On win32 the CLIs we drive (`claude`, `npm`, `brew`, ...) are launcher wrappers
 * (`.cmd`/`.ps1`/`.exe`). execFile cannot run a `.cmd` without a shell (ENOENT),
 * so the naïve fix is `shell: true`. But `shell: true` hands the whole command
 * line to cmd.exe as a STRING, which then splits on spaces and expands
 * metacharacters. A launcher path like `C:\Program Files\nodejs\npm.cmd` or a
 * variable argument then gets torn apart at the space (the v0.22.x defect).
 *
 * The fix — mirrored from Claude.execViaCmd — is to spawn cmd.exe ourselves as
 * the executed FILE (a `.exe`, so Node's batch-file caret hardening for
 * CVE-2024-27980 does not fire) and pass the real launcher + args as separate
 * argv ELEMENTS. Node double-quotes each element, so spaces and `& | < >` are
 * literal and injection is blocked.
 *
 * ## The `%` caveat
 *
 * cmd.exe still expands `%VAR%` even inside double quotes, which would silently
 * corrupt an argument. Per the original-data-preservation rule we fail loudly
 * (see [assertNoCmdPercentExpansion]) rather than run a mangled command. Callers
 * here pass fixed, well-known argv (`update`, `view <pkg> dist-tags --json`,
 * `upgrade <cask>`), none of which contain `%`, so this guard is a safety net.
 *
 * macOS/Linux never reach this function; callers branch on `process.platform`.
 */
export async function execViaCmdArgv(
  command: string,
  args: string[],
  options?: ExecFileOptions,
): Promise<{ err: Error | null; stdout: string; stderr: string }> {
  // `async` so this synchronous guard surfaces as a rejected promise (callers
  // await it), never an uncaught throw during promise construction.
  assertNoCmdPercentExpansion([command, ...args]);
  const comspec = process.env.ComSpec || 'cmd.exe';
  // `/d` skips AutoRun, `/s` keeps quoting predictable, `/c` runs then exits.
  const cmdArgs = ['/d', '/s', '/c', command, ...args];
  // encoding:'buffer' is pinned AFTER ...options on purpose. cmd.exe writes non-ASCII on
  // stdout in the system's legacy OEM codepage (CP949/CP936/CP932), never UTF-8, so Node's
  // default utf8 decoding would turn a Korean or Chinese install path into U+FFFD before we
  // ever see it — losing the bytes decodeConsoleOutput needs to recover the text.
  const execOptions: ExecFileOptionsWithBufferEncoding = {
    // Match Claude.exec's historic 10s default; callers (CLI update, which
    // downloads + links) pass their own longer timeout to override it.
    timeout: 10000,
    ...options,
    encoding: 'buffer',
    // shell:false — Node spawns cmd.exe directly, not nested in another shell.
    // windowsVerbatimArguments stays false so Node's standard quoting applies
    // (verbatim mode would pass args raw and re-expose `& | < >` to cmd).
    shell: false,
    windowsVerbatimArguments: false,
  };
  return new Promise((resolve) => {
    cpExecFile(comspec, cmdArgs, execOptions, (err, stdout, stderr) => {
      resolve({
        err: err ?? null,
        stdout: decodeConsoleOutput(stdout ?? ''),
        stderr: decodeConsoleOutput(stderr ?? ''),
      });
    });
  });
}

/**
 * Reject argv that cmd.exe would mangle via `%`-expansion. cmd.exe expands
 * `%VAR%` even inside the double quotes Node wraps each arg in, so a value like
 * `%API_KEY%` would reach the launcher altered (or emptied). We fail loudly
 * rather than run a corrupted command. The error names the position and the
 * cause but never echoes the full value — an argument may carry a secret.
 */
export function assertNoCmdPercentExpansion(args: string[]): void {
  const idx = args.findIndex((a) => a.includes('%'));
  if (idx === -1) return;
  throw new Error(
    `Cannot run this command on Windows: argument #${idx + 1} contains a '%' character, ` +
    `which Windows cmd.exe expands as an environment variable (even inside quotes) and would ` +
    `corrupt the value. Remove the '%' from that value and try again.`,
  );
}
