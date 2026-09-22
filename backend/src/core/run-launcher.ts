import { existsSync } from 'node:fs';
import { win32 } from 'node:path';
import { execFile as cpExecFile } from 'child_process';
import { augmentedEnv } from './augmented-path';
import { execViaCmdArgv, isDirectlyExecutable } from './win-exec';

export interface LauncherResult {
  ok: boolean;
  /** Combined stdout+stderr, trimmed — the text callers classify a failure by. */
  output: string;
  /**
   * stdout alone, untrimmed and unmixed.
   *
   * Carried beside `output` because a caller that PARSES the answer cannot use
   * the combined text: `npm view … --json` prints JSON on stdout while npm
   * writes warnings on stderr, and one warning turns the pair into something
   * `JSON.parse` rejects. Classifying a failure still reads `output`, since a
   * launcher is free to explain itself on either stream.
   */
  stdout: string;
  /** stderr alone, untrimmed. The other half of `output`. */
  stderr: string;
}

/**
 * Run an external package-manager launcher (`npm`/`pnpm`/`yarn`/`volta`/`brew`/
 * `winget`, ...) and capture its combined stdout+stderr.
 *
 * This is the ONE runner the CLI updater and the extend-kit installer share, so
 * "update the CLI" and "install the kit" resolve the launcher IDENTICALLY on
 * every platform — the divergence that let one work on macOS while the other
 * hung is gone.
 *
 * win32: cmd.exe argv ARRAY via [execViaCmdArgv]. The launchers are `.cmd`/`.ps1`
 * wrappers that execFile cannot run without a shell, but `shell:true` would hand
 * cmd.exe the whole line as a STRING and tokenize a path with spaces
 * (`C:\Program Files\nodejs\npm.cmd`) — the v0.22.x defect. The argv array keeps
 * every element intact.
 *
 * macOS/Linux: run the launcher directly with `shell:false`. PATH comes from
 * [augmentedEnv] (the nvm/volta/homebrew bins a GUI-launched backend's minimal
 * PATH would miss), NOT from a login-interactive shell — a `$SHELL -l -i -c`
 * sources the user's rc files and, on some setups, blocks or stalls a
 * non-interactive backend. augmentedEnv gives the same PATH without a shell.
 */
export function runLauncher(
  command: string,
  args: string[],
  opts: { timeout: number; maxBuffer: number; direct?: boolean; env?: NodeJS.ProcessEnv; cwd?: string },
): Promise<LauncherResult> {
  // Both Claude CLI and companion updates make the same Windows launcher
  // choice here. npm's JS entry bypasses cmd quoting and execution policy.
  //
  // The `.exe` test moved into [isDirectlyExecutable] so `Command.exec` asks the
  // same question in the same words. It used to live only here, and the copy
  // that was missing over there sent `C:\Program Files\nodejs\node.exe` through
  // cmd.exe, which split it at the space (#471).
  let direct = opts.direct || isDirectlyExecutable(command);
  if (process.platform === 'win32' && !direct && /^npm(?:\.cmd)?$/i.test(win32.basename(command))) {
    const directory = win32.isAbsolute(command) ? win32.dirname(command) : win32.dirname(process.execPath);
    const cli = win32.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (existsSync(cli)) {
      command = process.execPath;
      args = [cli, ...args];
      direct = true;
    }
  }
  if (process.platform === 'win32' && !direct) {
    return execViaCmdArgv(command, args, {
      env: { ...augmentedEnv(), ...opts.env },
      cwd: opts.cwd,
      timeout: opts.timeout,
      maxBuffer: opts.maxBuffer,
      windowsHide: true,
    }).then(({ err, stdout, stderr }) => ({
      ok: !err,
      output: `${stdout}${stderr}`.trim(),
      stdout,
      stderr,
    }));
  }
  return new Promise((resolve) => {
    cpExecFile(
      command,
      args,
      {
        env: { ...augmentedEnv(), ...opts.env },
        cwd: opts.cwd,
        timeout: opts.timeout,
        maxBuffer: opts.maxBuffer,
        windowsHide: true,
        // macOS/Linux: run the launcher directly, no shell tokenization.
        shell: false,
      },
      (err, stdout, stderr) => {
        const out = stdout?.toString() ?? '';
        const errOut = stderr?.toString() ?? '';
        resolve({ ok: !err, output: `${out}${errOut}`.trim(), stdout: out, stderr: errOut });
      },
    );
  });
}
