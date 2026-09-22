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
 * argv ELEMENTS. Node quotes each element that needs it, so spaces and
 * `& | < >` inside an ARGUMENT survive as literal text and injection is blocked.
 *
 * ## What the quoting does NOT protect: the command's own path (#471)
 *
 * The quoting above protects arguments. It does not protect the command itself,
 * because cmd.exe re-parses the line after `/c` before it runs anything, and its
 * documented rule (`cmd /?`, the `/S` branch) is: when the first character after
 * `/c` is a quote, strip that leading quote AND the last quote character on the
 * line. A command path containing a space is exactly the case Node quotes, so
 * the quotes that were protecting it are the two cmd.exe removes.
 *
 * Measured on Windows 11 with node installed at the official installer's default
 * `C:\Program Files\nodejs\node.exe`: running that path through cmd.exe answered
 * `'C:\Program' is not recognized as an internal or external command`, while
 * running the very same file directly worked. The earlier comment here claimed
 * the per-element quoting made the space literal; it does not, and #471 is what
 * that claim cost.
 *
 * Two things follow, and both are implemented rather than merely documented:
 *
 *   1. A command that does not NEED cmd.exe must not be handed to it. See
 *      [isDirectlyExecutable], the single judgment `Command.exec` and
 *      `runLauncher` both use.
 *   2. A command that DOES need cmd.exe (a `.cmd` launcher) and whose path
 *      contains a space is prefixed with `call`, so the first character after
 *      `/c` is no longer a quote and the stripping rule above never fires.
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
  //
  // `call` goes in front of a command path that contains a space, and only then.
  // Node quotes such a path, which makes it the leading quote cmd.exe strips
  // (see this module's header), and the command is then split at its space.
  // A leading `call` makes the first character after `/c` a letter, so the
  // stripping rule never applies and cmd.exe parses the quoted path the normal
  // way. `call` is how a batch launcher is invoked anyway, and it passes the
  // launcher's exit code back, so nothing else about the run changes. A path
  // without a space is left exactly as it was — no space means no quotes means
  // nothing for the rule to strip.
  const prefix = command.includes(' ') ? ['call'] : [];
  const cmdArgs = ['/d', '/s', '/c', ...prefix, command, ...args];
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
 * Can Node start this program itself, without cmd.exe in front of it?
 *
 * The ONE place that judgment is made. `Command.exec` and [runLauncher] both ask
 * here, because a judgment copied into two files is a judgment that drifts: this
 * one already existed in `runLauncher` while `Command.exec` sent EVERY win32
 * command through cmd.exe regardless, which is how `process.execPath` —
 * `C:\Program Files\nodejs\node.exe` on a default Windows install — ended up
 * being torn apart at its space (#471).
 *
 * `.exe` is the whole test, because an executable image is what CreateProcess
 * runs and what Node's `execFile`/`spawn` hand it directly. A `.cmd`/`.bat`
 * launcher is a script, not an image, so it genuinely needs cmd.exe to
 * interpret it (`execFile` on one without a shell fails outright), and a bare
 * name like `npm` needs cmd.exe to resolve it through PATHEXT. Both of those
 * still go the cmd.exe way.
 *
 * Absoluteness is deliberately not part of the test: CreateProcess searches PATH
 * for a bare `foo.exe` exactly as cmd.exe would, so the answer does not change.
 *
 * Asked on every platform and answered the same way, so callers keep their own
 * `process.platform` check where they already had one rather than gaining a
 * second, hidden one here.
 */
export function isDirectlyExecutable(command: string): boolean {
  return /\.exe$/i.test(command);
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
