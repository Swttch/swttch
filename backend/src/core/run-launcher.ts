import { execFile as cpExecFile } from 'child_process';
import { augmentedEnv } from './augmented-path';
import { execViaCmdArgv } from './win-exec';

export interface LauncherResult {
  ok: boolean;
  /** Combined stdout+stderr, trimmed — the text callers classify a failure by. */
  output: string;
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
  opts: { timeout: number; maxBuffer: number },
): Promise<LauncherResult> {
  if (process.platform === 'win32') {
    return execViaCmdArgv(command, args, {
      env: augmentedEnv(),
      timeout: opts.timeout,
      maxBuffer: opts.maxBuffer,
    }).then(({ err, stdout, stderr }) => ({
      ok: !err,
      output: `${stdout}${stderr}`.trim(),
    }));
  }
  return new Promise((resolve) => {
    cpExecFile(
      command,
      args,
      {
        env: augmentedEnv(),
        timeout: opts.timeout,
        maxBuffer: opts.maxBuffer,
        // macOS/Linux: run the launcher directly, no shell tokenization.
        shell: false,
      },
      (err, stdout, stderr) => {
        const output = `${stdout?.toString() ?? ''}${stderr?.toString() ?? ''}`.trim();
        resolve({ ok: !err, output });
      },
    );
  });
}
