import {
  spawn as cpSpawn,
  execFile as cpExecFile,
  type ChildProcess,
  type SpawnOptions,
} from 'child_process';
import { augmentedEnv } from './augmented-path';
import { resolveWslCwd } from './wsl-path';
import { execViaCmdArgv, isDirectlyExecutable } from './win-exec';
import { pickWin32Launcher } from './which-launcher';

/**
 * How to invoke the command's process. The distinction only matters on unix.
 */
export enum ShellKind {
  /**
   * Non-interactive. win32 → run through cmd.exe as an argv ARRAY (no shell
   * tokenization; the launcher resolves via PATHEXT). unix → run the binary
   * directly with no shell.
   */
  Direct = 'Direct',
  /**
   * unix only: run inside an interactive login shell (`$SHELL -l -i -c`) so the
   * command sees the PATH the user's rc files export (nvm/volta/etc). win32 has
   * no equivalent and is treated as Direct.
   */
  LoginInteractive = 'LoginInteractive',
}

export interface CommandOptions {
  cwd?: string;
  timeout?: number;
  maxBuffer?: number;
  /** Extra env, merged on top of the augmented PATH (these win on conflict). */
  env?: NodeJS.ProcessEnv;
  /** Invocation style (default Direct). */
  shell?: ShellKind;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * A single external-command invocation and the ONE place platform differences
 * (win32 cmd.exe, unix login shell, WSL cwd, augmented PATH, PATHEXT launcher
 * resolution) are decided. Callers describe WHAT to run; Command decides HOW.
 *
 * This is the shared execution core the per-tool adapters (claude / ccb / package
 * managers) compose over, so "which shell / which binary actually runs" is decided
 * once instead of drifting across call sites (the class of bug fixed in
 * pickWin32Launcher / the openTerminal dedup). It intentionally holds NO
 * tool-specific policy — auth-token stripping, CLAUDE_CONFIG_DIR projection, etc.
 * stay in the adapters that build a Command.
 */
export class Command {
  constructor(
    public readonly bin: string,
    public readonly args: string[] = [],
    public readonly options: CommandOptions = {},
  ) {}

  /** Env = augmented PATH with the caller's overrides layered on top. */
  private env(): NodeJS.ProcessEnv {
    return augmentedEnv(this.options.env);
  }

  /** cwd, translated to the in-distro path when running inside WSL (#57). */
  private cwd(): string | undefined {
    const resolved = resolveWslCwd(this.options.cwd);
    return typeof resolved === 'string' ? resolved : undefined;
  }

  /** Run once and capture stdout/stderr. Rejects on non-zero exit. */
  async exec(): Promise<CommandResult> {
    // win32 needs cmd.exe only for a command Node cannot start itself — a
    // `.cmd`/`.ps1` script, or a bare name that PATHEXT has to resolve. An
    // executable image is run directly, on win32 exactly as on unix.
    //
    // The condition is [isDirectlyExecutable] rather than a copy of its test,
    // because `runLauncher` asks the same question and the two must never answer
    // differently. Without the condition every win32 command went through
    // cmd.exe, which re-parses the line and splits a quoted command path at its
    // space — so `process.execPath`, `C:\Program Files\nodejs\node.exe` on a
    // default install, could not start at all (#471).
    if (process.platform === 'win32' && !isDirectlyExecutable(this.bin)) {
      // cmd.exe argv array: the launcher (.cmd/.ps1) resolves via PATHEXT and
      // no shell tokenization touches the individual args.
      const { err, stdout, stderr } = await execViaCmdArgv(this.bin, this.args, {
        cwd: this.cwd(),
        env: this.env(),
        timeout: this.options.timeout ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: this.options.maxBuffer,
      });
      // On failure, carry stdout/stderr on the error so callers can classify by
      // the command's output (e.g. permission-failure detection for installs).
      if (err) throw Object.assign(err, { stdout, stderr });
      return { stdout, stderr };
    }
    // `!== 'win32'` is carried explicitly now that a win32 command can reach
    // this line: an executable image skips the cmd.exe branch above, and win32
    // has no login-interactive shell to fall into ({@link ShellKind}).
    if (
      process.platform !== 'win32' &&
      (this.options.shell ?? ShellKind.Direct) === ShellKind.LoginInteractive
    ) {
      const userShell = process.env.SHELL || '/bin/sh';
      // fish rejects `-i` in this form; fall back to a POSIX shell.
      const sh = /\/fish$/.test(userShell) ? '/bin/sh' : userShell;
      const line = [this.bin, ...this.args].join(' ');
      return this.runExecFile(sh, ['-l', '-i', '-c', line]);
    }
    return this.runExecFile(this.bin, this.args);
  }

  /**
   * Spawn for streaming output (chat). Shell defaults to true on win32 for a
   * command Node cannot start itself, so the .cmd/.ps1 launcher resolves;
   * callers may override via spawnOptions.
   *
   * An executable image defaults to no shell for the same reason {@link exec}
   * skips cmd.exe for one: `shell: true` hands the whole line to cmd.exe, which
   * splits a quoted command path at its space (#471). The judgment is the shared
   * [isDirectlyExecutable] rather than a third copy of the test.
   */
  spawn(spawnOptions?: SpawnOptions): ChildProcess {
    return cpSpawn(this.bin, this.args, {
      ...spawnOptions,
      cwd: this.cwd(),
      env: { ...this.env(), ...spawnOptions?.env },
      shell:
        spawnOptions?.shell ??
        (process.platform === 'win32' && !isDirectlyExecutable(this.bin)),
    });
  }

  /**
   * Absolute path of the binary that will ACTUALLY run. On win32 `where` also
   * lists the extension-less MSYS script; pickWin32Launcher picks the PATHEXT
   * match cmd.exe resolves. Returns null when the binary is not found.
   */
  which(): Promise<string | null> {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    return new Promise((resolve) => {
      cpExecFile(finder, [this.bin], { env: this.env(), timeout: 5_000 }, (err, stdout) => {
        if (err) return resolve(null);
        const out = stdout?.toString() ?? '';
        if (process.platform === 'win32') return resolve(pickWin32Launcher(out));
        return resolve(out.trim().split('\n')[0]?.trim() || null);
      });
    });
  }

  private runExecFile(file: string, args: string[]): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      cpExecFile(
        file,
        args,
        {
          cwd: this.cwd(),
          env: this.env(),
          timeout: this.options.timeout ?? DEFAULT_TIMEOUT_MS,
          maxBuffer: this.options.maxBuffer,
        },
        (err, stdout, stderr) => {
          const out = stdout?.toString() ?? '';
          const errOut = stderr?.toString() ?? '';
          // Same as exec()'s win32 branch: attach output so callers can classify a failure.
          if (err) return reject(Object.assign(err, { stdout: out, stderr: errOut }));
          resolve({ stdout: out, stderr: errOut });
        },
      );
    });
  }
}
