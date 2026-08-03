import {
  spawn as cpSpawn,
  execFile as cpExecFile,
  execFileSync,
  type ChildProcess,
  type SpawnOptions,
  type ExecFileOptions,
} from 'child_process';
import { readMergedSettings, resolveClaudeConfigDirOverride } from './features/settings';
import { getStrippableAuthEnvKeys } from './features/claude-settings';
import { augmentedPath } from './augmented-path';
import { resolveWslCwd } from './wsl-path';
import { execViaCmdArgv } from './win-exec';
import { pickWin32Launcher } from './which-launcher';
import { spawnWin32JobCli } from './win-job';

export class Claude {
  private static cliPath: string | null = null;
  private static initialized = false;
  // Cache of the resolved launcher absolute path on win32 (the result of
  // `where claude`). Populated lazily by execViaCmd() so repeated MCP calls
  // don't re-shell `where` each time. Reset on refresh() in case cliPath changes.
  private static resolvedWin32Path: string | null = null;
  // The CLAUDE_CONFIG_DIR the backend inherited at startup (e.g. exported in the
  // user's shell, or echoed temporarily). Captured once, before any plugin-settings
  // override is applied, so we can restore it when the override is later cleared.
  private static readonly inheritedConfigDir = process.env.CLAUDE_CONFIG_DIR;

  /** Load cliPath from settings. Call at server start or on settings change. */
  static async refresh(workingDir?: string): Promise<void> {
    Claude.initialized = true;
    await Claude.applyConfigDir(workingDir);
  }

  /**
   * Project the effective CLAUDE_CONFIG_DIR for the given working directory onto
   * process.env, so getClaudeConfigDir(), the spawned `claude`, and the `ccb` usage
   * child all resolve the SAME Claude data directory.
   *
   * Call this whenever an active context LOADS — a chat for a given workingDir, or the
   * project picker with no workingDir — NOT merely when a setting is saved. process.env
   * is a single shared slot on the backend, so projecting only at load time keeps a
   * project-scoped value from leaking across the whole backend (issue #123 follow-up).
   *
   * The Claude CLI reads CLAUDE_CONFIG_DIR only from process.env (never from
   * settings.json's `env`, which it consults too late), so we mirror our setting here.
   * Priority: settings env (project > global) > inherited startup env > ~/.claude.
   */
  static async applyConfigDir(workingDir?: string): Promise<void> {
    // `cliPath` rides along on the same load-time projection. A terminal user can
    // point a project at a specific claude binary, so the GUI must allow it too
    // (CLI equivalence, CLAUDE.md) — hence the merged read rather than the global
    // file. Like process.env below, the resolved command is a single shared slot,
    // so it is re-projected whenever a context loads instead of being cached per
    // call site; that is what keeps a project-scoped value from leaking backend-wide.
    const { settings } = await readMergedSettings(workingDir);
    const nextCliPath = (settings.cliPath as string) || null;
    if (nextCliPath !== Claude.cliPath) {
      Claude.cliPath = nextCliPath;
      // The win32 launcher cache was resolved from the previous binary.
      Claude.resolvedWin32Path = null;
    }

    const override = await resolveClaudeConfigDirOverride(workingDir);
    if (override) {
      process.env.CLAUDE_CONFIG_DIR = override;
    } else if (Claude.inheritedConfigDir !== undefined) {
      process.env.CLAUDE_CONFIG_DIR = Claude.inheritedConfigDir;
    } else {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
  }

  static get command(): string {
    return Claude.cliPath || 'claude';
  }

  /**
   * The CLAUDE_CONFIG_DIR the backend inherited from its environment at startup,
   * before any plugin-settings override was applied (undefined if none). The settings
   * UI surfaces this so a value set only transiently (e.g. echoed/exported in a shell)
   * can be offered for persistence. (#123)
   */
  static get inheritedClaudeConfigDir(): string | undefined {
    return Claude.inheritedConfigDir;
  }

  static get env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PATH: augmentedPath(),
    };
  }

  /**
   * Spawn `claude`. Pass `win32JobSessionId` ONLY for the long-lived chat CLI: on
   * win32 it routes the spawn through a Job Object wrapper so the whole CLI tree —
   * including MSYS/git-bash workers that reparent out of the taskkill /F /T tree —
   * is torn down when the wrapper (or the backend) dies. The sessionId rides along
   * so the on-disk registry's orphan sweep can find and kill that wrapper. Short-
   * lived spawns (auth, /usage, config) omit it and keep the plain shell path.
   */
  static spawn(args: string[], options?: SpawnOptions, win32JobSessionId?: string): ChildProcess {
    const cwd = resolveWslCwd(options?.cwd);
    const env = { ...Claude.env, ...options?.env };
    if (process.platform === 'win32' && win32JobSessionId) {
      return spawnWin32JobCli(Claude.command, args, win32JobSessionId, { ...options, cwd, env });
    }
    return cpSpawn(Claude.command, args, {
      ...options,
      cwd,
      shell: options?.shell ?? (process.platform === 'win32'),
      env,
    });
  }

  /**
   * The env overrides that strip inherited OAuth *tokens* before handing the env to a
   * spawned CLI child, given the merged Claude settings for [workingDir]. Centralizes the
   * strip policy (see {@link getStrippableAuthEnvKeys}) so every auth-bearing CLI invocation
   * — chat AND `auth status` — sees the SAME credentials. Previously only the chat spawn
   * stripped, so `auth status` could report a "logged in" state the chat then didn't use.
   * Returns `{ KEY: undefined }` pairs; child_process omits undefined-valued keys from the
   * spawned env. ANTHROPIC_API_KEY is never stripped — see getStrippableAuthEnvKeys.
   */
  private static async authStripEnv(workingDir?: string): Promise<Record<string, undefined>> {
    const keys = await getStrippableAuthEnvKeys(workingDir);
    if (keys.length > 0) {
      console.error('[node-backend]', `Stripping inherited auth env from CLI: ${keys.join(', ')}`);
    }
    return Object.fromEntries(keys.map((k) => [k, undefined]));
  }

  /**
   * {@link spawn} for auth-bearing CLI calls (chat `-p`, `/usage`): identical to spawn but
   * also strips inherited OAuth tokens for [workingDir] so the child authenticates the same
   * way `auth status` reports. Use this instead of spawn for anything whose result depends on
   * the active credentials. Do NOT use it for `auth login` (it intentionally re-authenticates).
   */
  static async spawnAuthed(
    args: string[],
    workingDir?: string,
    options?: SpawnOptions,
    win32JobSessionId?: string,
  ): Promise<ChildProcess> {
    const stripEnv = await Claude.authStripEnv(workingDir);
    return Claude.spawn(args, { ...options, env: { ...options?.env, ...stripEnv } }, win32JobSessionId);
  }

  /**
   * {@link exec} for auth-bearing CLI calls (`auth status`): identical to exec but also strips
   * inherited OAuth tokens for [workingDir], so the login state it reports matches what the
   * chat spawn actually uses.
   */
  static async execAuthed(
    args: string[],
    workingDir?: string,
    options?: ExecFileOptions,
  ): Promise<{ stdout: string; stderr: string }> {
    const stripEnv = await Claude.authStripEnv(workingDir);
    return Claude.exec(args, { ...options, env: { ...options?.env, ...stripEnv } });
  }

  /**
   * Terminate a process spawned via {@link spawn} AND its children. On win32
   * spawn() runs through a shell, so the real `claude` is a grandchild of
   * cmd.exe — a plain SIGTERM to `proc` leaves it orphaned. `taskkill /T` tears
   * down the whole tree. On macOS/Linux, chat CLIs are spawned detached (see
   * claude-process.ts) so they lead their own process group and signalling
   * `-pid` reaches the CLI plus every descendant (subagent shells, background
   * tasks); for non-detached children the group signal fails with ESRCH and we
   * fall back to a plain signal, which is the pre-existing behavior. Used by
   * every kill path for a spawned CLI child.
   */
  static killTree(proc: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
    if (!proc.pid) return;
    // Once the child has been reaped, proc.pid is a stale number the OS may have
    // reused. Signalling -proc.pid (or taskkill /T) then hits an unrelated process
    // group/tree. proc.kill() would be a no-op here, but the raw group signal is
    // not liveness-aware — bail before issuing it. (Guards e.g. an uncleared
    // safety-timeout killTree firing after the process already closed.)
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)]);
      } catch {
        proc.kill();
      }
    } else {
      try {
        process.kill(-proc.pid, signal);
      } catch {
        // Not a process-group leader (or already gone) — plain signal as before.
        proc.kill(signal);
      }
    }
  }

  static async exec(args: string[], options?: ExecFileOptions): Promise<{ stdout: string; stderr: string }> {
    // The default win32 path runs through a shell so the `.cmd`/`.ps1` launcher
    // resolves (issue #99 — see runExecFile). But a shell tokenizes the argv:
    // for callers that pass arbitrary values (e.g. `mcp add-json <json>` whose
    // JSON carries `"`, `&`, `%`, `|`, spaces), cmd.exe would corrupt the
    // argument and open a command-injection surface. Such callers pass
    // shell:false to demand non-shell-tokenized argv. On win32 that needs special
    // handling: Node 18.20.2/20.12.2+ (CVE-2024-27980) refuses to execFile a
    // .cmd/.bat with shell:false directly (EINVAL), so we spawn cmd.exe ourselves
    // with the launcher as an argv element (see execViaCmd). macOS/Linux run the
    // launcher directly with shell:false and need none of this.
    if (process.platform === 'win32' && options?.shell === false) {
      return Claude.execViaCmd(args, options);
    }
    return Claude.runExecFile(Claude.command, args, options);
  }

  /**
   * Run cpExecFile against `command` with the standard env/cwd projection.
   * `shell` defaults to true on win32 (the #99 launcher-resolution path) unless
   * the caller overrides it.
   */
  private static runExecFile(
    command: string,
    args: string[],
    options?: ExecFileOptions,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      cpExecFile(command, args, {
        timeout: 10000,
        ...options,
        cwd: resolveWslCwd(options?.cwd),
        // On Windows the `claude` launcher is a .cmd/.ps1 wrapper that execFile
        // cannot run without a shell (it fails with ENOENT). spawn() already
        // runs through a shell on win32; keep exec() symmetric so `auth status`
        // and `--version` resolve the wrapper. Without this, GET_ACCOUNT always
        // reported "not logged in" and users were stuck on the login screen
        // even while authenticated (#99).
        shell: options?.shell ?? (process.platform === 'win32'),
        env: {
          ...Claude.env,
          ...options?.env,
        },
      }, (err, stdout, stderr) => {
        const out = stdout?.toString() ?? '';
        const errText = stderr?.toString() ?? '';
        if (err) {
          // Preserve captured output on the rejected error so callers can tell a
          // clean non-zero exit that still printed valid data (e.g. `auth status`
          // on a logged-out account: exit 1 + `{"loggedIn":false}`) apart from a
          // real failure (timeout / spawn error) that has no parseable stdout.
          // Mirrors util.promisify(execFile), which attaches stdout/stderr to err.
          const execErr = err as Error & { stdout?: string; stderr?: string };
          execErr.stdout = out;
          execErr.stderr = errText;
          reject(execErr);
          return;
        }
        resolve({ stdout: out, stderr: errText });
      });
    });
  }

  /**
   * win32 non-shell-tokenized path: resolve the `.cmd` launcher to an absolute
   * path, then run `cmd.exe /d /s /c <launcher> <...args>` with shell:false and
   * an argv ARRAY (each original argument stays its own element).
   *
   * Escaping reality: the spawned file is cmd.exe (a .exe), NOT a .cmd/.bat, so
   * Node's batch-file caret/quote hardening (CVE-2024-27980) does NOT fire here.
   * Node applies only standard CommandLineToArgvW quoting — it wraps each arg in
   * double quotes. Inside those quotes `&` `|` `<` `>` are literal, so command
   * injection is blocked. BUT cmd.exe still expands `%FOO%` even inside double
   * quotes, which would silently corrupt the JSON before it reaches the launcher.
   *
   * Per the original-data-preservation rule, corrupting config silently is worse
   * than failing, so we reject any arg containing `%` up front. In practice the
   * only shell:false caller is `mcp add-json`, whose JSON carries literal `%`
   * only inside an env value the user can rewrite.
   */
  private static async execViaCmd(
    args: string[],
    options?: ExecFileOptions,
  ): Promise<{ stdout: string; stderr: string }> {
    // Resolve the `.cmd` launcher to an absolute path, then delegate the
    // cmd.exe argv-array wrapping to the shared helper (execViaCmdArgv). The
    // helper enforces the `%`-expansion guard and standard-quoting rules; here
    // we only add the launcher resolution + env/cwd projection specific to the
    // Claude launcher. See win-exec.ts for the full rationale.
    const launcher = (await Claude.which()) ?? Claude.command;
    const { err, stdout, stderr } = await execViaCmdArgv(launcher, args, {
      ...options,
      cwd: resolveWslCwd(options?.cwd),
      env: {
        ...Claude.env,
        ...options?.env,
      },
    });
    if (err) {
      // Keep the captured output on the error so a clean non-zero exit that still
      // printed valid data stays recoverable, matching runExecFile's contract.
      const execErr = err as Error & { stdout?: string; stderr?: string };
      execErr.stdout = stdout;
      execErr.stderr = stderr;
      throw execErr;
    }
    return { stdout, stderr };
  }

  static which(): Promise<string | null> {
    if (process.platform === 'win32' && Claude.resolvedWin32Path) {
      return Promise.resolve(Claude.resolvedWin32Path);
    }
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    return new Promise((resolve) => {
      cpExecFile(cmd, [Claude.command], {
        env: Claude.env,
        timeout: 5000,
      }, (err, stdout) => {
        let resolved: string | null;
        if (err) {
          resolved = null;
        } else if (process.platform === 'win32') {
          // `where` also lists the extension-less MSYS script (`...\npm\claude`);
          // pick the launcher cmd.exe actually runs (first PATHEXT match) so
          // which() agrees with the binary spawn()/exec() resolve through cmd.exe.
          resolved = pickWin32Launcher(stdout?.toString() ?? '');
        } else {
          resolved = (stdout?.toString() ?? '').trim().split('\n')[0]?.trim() || null;
        }
        if (process.platform === 'win32' && resolved) {
          Claude.resolvedWin32Path = resolved;
        }
        resolve(resolved);
      });
    });
  }

}
