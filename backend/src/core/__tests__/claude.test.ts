import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';

// Point Claude's config dir at an empty temp dir for the whole suite. Claude.exec
// now consults the user's MCP configuration (to reclaim the docker containers a
// CLI leaves behind), and reading the real ~/.claude.json would make these
// assertions depend on which MCP servers the developer running them happens to
// have installed.

// We can't easily test Claude class directly because buildAugmentedPath runs
// at class load time. Instead we test the observable behavior.
// For now, test that Claude.command and Claude.env have expected shapes.

// Mock readSettingsFile to avoid file system access
vi.mock('../features/settings', () => ({
  readSettingsFile: vi.fn().mockResolvedValue({ cliPath: null }),
  readMergedSettings: vi.fn().mockResolvedValue({ settings: { cliPath: null }, overrides: [] }),
  resolveClaudeConfigDirOverride: vi.fn().mockResolvedValue(null),
}));

// Mock child_process so we can inspect the options passed to spawn/execFile
// without launching a real process. `where claude` (used by Claude.which() to
// resolve the launcher on win32) resolves to a fake absolute .cmd path so the
// shell:false branch has a concrete executable to run.
const FAKE_CLAUDE_CMD = 'C:\\Users\\me\\AppData\\npm\\claude.cmd';

vi.mock('child_process', () => ({
  // `once` as well as `on`: Claude.spawn hangs the MCP container reclaim off the
  // process's `close` event, so a stand-in without it is not a ChildProcess.
  spawn: vi.fn(() => ({ on: vi.fn(), once: vi.fn() })),
  execFile: vi.fn(
    (
      cmd: string,
      _args: string[],
      _opts: unknown,
      cb?: (err: unknown, stdout: string, stderr: string) => void,
    ) => {
      // Emulate `where claude` returning the launcher's absolute path.
      const stdout = cmd === 'where' ? `${FAKE_CLAUDE_CMD}\r\n` : '{}';
      cb?.(null, stdout, '');
      return { on: vi.fn(), once: vi.fn() };
    },
  ),
}));

import { spawn as cpSpawn, execFile as cpExecFile } from 'child_process';
import { Claude } from '../claude';

const ORIGINAL_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;

beforeAll(() => {
  process.env.CLAUDE_CONFIG_DIR = mkdtempSync(`${tmpdir()}/ccg-claude-test-`);
});

afterAll(() => {
  if (ORIGINAL_CONFIG_DIR === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CONFIG_DIR;
});

describe('Claude', () => {
  describe('command', () => {
    it('should default to "claude" when no cliPath is configured', () => {
      expect(Claude.command).toBe('claude');
    });
  });

  describe('env', () => {
    it('should include augmented PATH', () => {
      const env = Claude.env;
      expect(env.PATH).toBeDefined();
      expect(typeof env.PATH).toBe('string');
    });

    it('should preserve existing environment variables', () => {
      const env = Claude.env;
      // Should include all current process env vars
      expect(env.PATH).toBeDefined();
    });
  });

  describe('refresh()', () => {
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;

    afterEach(async () => {
      const settings = await import('../features/settings');
      vi.mocked(settings.resolveClaudeConfigDirOverride).mockResolvedValue(null);
      if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    });

    it('should load settings without throwing', async () => {
      await expect(Claude.refresh()).resolves.not.toThrow();
    });

    it('applies the settings CLAUDE_CONFIG_DIR override onto process.env (#123)', async () => {
      const settings = await import('../features/settings');
      vi.mocked(settings.resolveClaudeConfigDirOverride).mockResolvedValueOnce('/custom/.claude-work');

      await Claude.refresh('/some/project');

      expect(process.env.CLAUDE_CONFIG_DIR).toBe('/custom/.claude-work');
    });
  });

  // Regression for issue #99: on Windows the `claude` launcher is a .cmd/.ps1
  // wrapper that execFile cannot run without a shell, so `claude auth status`
  // (GET_ACCOUNT) failed with ENOENT and the user was stuck on the login screen
  // even while already authenticated. spawn() already ran through a shell on
  // win32; exec() must do the same so the two stay symmetric.
  describe('shell handling across platforms', () => {
    const originalPlatform = process.platform;

    const setPlatform = (value: NodeJS.Platform) => {
      Object.defineProperty(process, 'platform', { value, configurable: true });
    };

    afterEach(() => {
      setPlatform(originalPlatform);
      vi.clearAllMocks();
    });

    it('exec() runs through a shell on win32 (#99)', async () => {
      setPlatform('win32');
      await Claude.exec(['auth', 'status']);
      const opts = vi.mocked(cpExecFile).mock.calls[0]?.[2] as { shell?: boolean };
      expect(opts.shell).toBe(true);
    });

    it('exec() does not force a shell on non-win32', async () => {
      setPlatform('darwin');
      await Claude.exec(['auth', 'status']);
      const opts = vi.mocked(cpExecFile).mock.calls[0]?.[2] as { shell?: boolean };
      expect(opts.shell).toBeFalsy();
    });

    it('exec() honors an explicit shell override', async () => {
      setPlatform('win32');
      await Claude.exec(['auth', 'status'], { shell: false });
      // On win32 a shell:false override re-routes through cmd.exe (see the
      // arbitrary-argv suite below), so the launcher call is the LAST execFile
      // call. It must still run without an additional shell (shell:false honored).
      const calls = vi.mocked(cpExecFile).mock.calls;
      const opts = calls[calls.length - 1]?.[2] as { shell?: boolean };
      expect(opts.shell).toBe(false);
    });

    it('spawn() runs through a shell on win32', () => {
      setPlatform('win32');
      Claude.spawn(['auth', 'login', '--claudeai']);
      const opts = vi.mocked(cpSpawn).mock.calls[0]?.[2] as { shell?: boolean };
      expect(opts.shell).toBe(true);
    });
  });

  // Regression for the v0.22.0 Windows cross-platform defect: `claude mcp
  // add-json <name> <json>` passes arbitrary JSON (quotes, `&`, `%`, `|`, spaces)
  // as a positional argv. With the default win32 shell:true path, cmd.exe
  // tokenizes those metacharacters, corrupting the JSON and opening a command
  // injection surface. Callers that hand untrusted/complex argv must opt into
  // shell:false; exec() then runs cmd.exe as the spawned file with the .cmd
  // launcher as an argument.
  //
  // What Node actually does here (CVE-2024-27980): Node's batch-file caret/quote
  // hardening fires ONLY when the spawned file itself is a .cmd/.bat. Here the
  // spawned file is cmd.exe (a .exe) and the launcher is an argument, so Node
  // applies only standard CommandLineToArgvW quoting (wraps each arg in double
  // quotes). Inside those quotes `&` `|` `<` `>` are literal — command injection
  // is blocked — but `%` is still expanded by cmd.exe even inside quotes, which
  // would silently corrupt the JSON. execViaCmd therefore rejects any arg
  // containing `%` before running (see the `%` guard tests below).
  describe('exec() shell:false on win32 (arbitrary-argv safety)', () => {
    const originalPlatform = process.platform;

    const setPlatform = (value: NodeJS.Platform) => {
      Object.defineProperty(process, 'platform', { value, configurable: true });
    };

    afterEach(() => {
      setPlatform(originalPlatform);
      vi.clearAllMocks();
    });

    const jsonArg = JSON.stringify({ command: 'npx', args: ['-y', 'pkg'], env: { K: 'a & b | c' } });

    it('invokes cmd.exe with the resolved launcher and argv array (no shell tokenization)', async () => {
      setPlatform('win32');
      await Claude.exec(['mcp', 'add-json', 'srv', jsonArg], { shell: false });

      // The launcher call is the LAST execFile call (a `where` resolution call
      // may precede it). It must target a shell executable (cmd.exe / ComSpec).
      const calls = vi.mocked(cpExecFile).mock.calls;
      const launcherCall = calls[calls.length - 1];
      const cmd = launcherCall[0] as string;
      const callArgs = launcherCall[1] as string[];
      const opts = launcherCall[2] as { shell?: boolean; windowsVerbatimArguments?: boolean };

      expect(cmd.toLowerCase()).toContain('cmd');
      // Node must NOT additionally wrap this in a shell — we run cmd.exe ourselves.
      expect(opts.shell).toBeFalsy();
      // Keep Node's standard CommandLineToArgvW quoting (each arg double-quoted).
      // Verbatim mode would pass args raw and re-expose `&|<>` to cmd tokenizing.
      expect(opts.windowsVerbatimArguments).toBeFalsy();

      // `/c` then the resolved launcher absolute path, then the original argv —
      // each original arg preserved as its OWN array element (never concatenated
      // into a single shell string).
      expect(callArgs).toContain('/c');
      expect(callArgs).toContain(FAKE_CLAUDE_CMD);
      expect(callArgs).toContain(jsonArg);
      const jsonIdx = callArgs.indexOf(jsonArg);
      expect(callArgs[jsonIdx - 1]).toBe('srv');
    });

    it('keeps the JSON argument intact as a single element (no splitting on spaces/metachars)', async () => {
      setPlatform('win32');
      await Claude.exec(['mcp', 'add-json', 'srv', jsonArg], { shell: false });

      const calls = vi.mocked(cpExecFile).mock.calls;
      const callArgs = calls[calls.length - 1][1] as string[];
      // Exactly one element equals the full JSON blob, byte-for-byte.
      expect(callArgs.filter((a) => a === jsonArg)).toHaveLength(1);
    });

    it('does not wrap in cmd.exe on non-win32 even with shell:false', async () => {
      setPlatform('darwin');
      await Claude.exec(['mcp', 'add-json', 'srv', jsonArg], { shell: false });

      const calls = vi.mocked(cpExecFile).mock.calls;
      const lastCall = calls[calls.length - 1];
      const cmd = lastCall[0] as string;
      const callArgs = lastCall[1] as string[];
      const opts = lastCall[2] as { shell?: boolean };
      expect(cmd).toBe('claude');
      expect(callArgs).toEqual(['mcp', 'add-json', 'srv', jsonArg]);
      expect(opts.shell).toBeFalsy();
    });

    // `%` guard: cmd.exe expands `%FOO%` even inside double quotes, so a JSON
    // value like `"%API_KEY%"` would reach the launcher corrupted. Per the
    // original-data-preservation rule, fail loudly instead of writing a mangled
    // config. win32-only (this path), since macOS/Linux never touch cmd.exe.
    it('throws on win32 when any arg contains `%` (would be cmd-expanded)', async () => {
      setPlatform('win32');
      const withPercent = JSON.stringify({ command: 'svc', env: { TOKEN: '%API_KEY%' } });

      await expect(Claude.exec(['mcp', 'add-json', 'srv', withPercent], { shell: false }))
        .rejects.toThrow(/%/);

      // The guard must fire BEFORE any cmd.exe execution.
      const ranCmd = vi
        .mocked(cpExecFile)
        .mock.calls.some((c) => (c[0] as string).toLowerCase().includes('cmd'));
      expect(ranCmd).toBe(false);
    });

    it('does not leak the offending value verbatim in the `%` error message', async () => {
      setPlatform('win32');
      const secret = 'super-secret-%TOKEN%-value';
      const withPercent = JSON.stringify({ command: 'svc', env: { TOKEN: secret } });

      const err = await Claude.exec(['mcp', 'add-json', 'srv', withPercent], { shell: false })
        .then(() => null)
        .catch((e: unknown) => e as Error);

      expect(err).toBeInstanceOf(Error);
      // Mentions `%` is the problem but never echoes the full secret-bearing arg.
      expect(err!.message).toContain('%');
      expect(err!.message).not.toContain(secret);
    });

    it('does NOT apply the `%` guard on non-win32 (cmd.exe uninvolved)', async () => {
      setPlatform('darwin');
      const withPercent = JSON.stringify({ command: 'svc', env: { TOKEN: '%API_KEY%' } });

      await expect(Claude.exec(['mcp', 'add-json', 'srv', withPercent], { shell: false }))
        .resolves.not.toThrow();
    });
  });
});

// CLI equivalence (CLAUDE.md): a terminal user can point a project at a specific
// claude binary, so the GUI must allow it too. `cliPath` therefore resolves through
// the merged (global + project) settings for the active working directory.
//
// process.env and the resolved launcher are single shared slots on the backend, so
// — exactly like CLAUDE_CONFIG_DIR before it (#123) — the value is projected when a
// context LOADS rather than being cached per call site. applyConfigDir is that
// load-time hook and already runs on every entry point, so the CLI path rides along.
// `where` / `claude` run through cmd.exe, which writes non-ASCII on stdout in the system's
// legacy OEM codepage rather than UTF-8. Letting Node decode that as utf8 turns an install
// path under a Korean or Chinese user directory into U+FFFD, and the launcher we resolve
// from it can no longer be spawned. See console-encoding.ts.
describe('console output decoding on win32 paths', () => {
  // which() caches its win32 result; changing cliPath is how the class drops that cache,
  // so each test here starts from a cold resolve rather than a stale hit.
  async function coldLauncherCache(): Promise<void> {
    const { readMergedSettings } = await import('../features/settings');
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { cliPath: 'claude' }, overrides: [] });
    await Claude.applyConfigDir('/cold/a');
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { cliPath: null }, overrides: [] });
    await Claude.applyConfigDir('/cold/b');
    vi.clearAllMocks();
  }

  afterEach(async () => {
    const { readMergedSettings } = await import('../features/settings');
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { cliPath: null }, overrides: [] });
    vi.clearAllMocks();
  });

  it('asks execFile for raw bytes instead of Node default utf8 decoding', async () => {
    await coldLauncherCache();
    await Claude.which();

    const opts = vi.mocked(cpExecFile).mock.calls[0][2] as { encoding?: string };
    expect(opts.encoding).toBe('buffer');
  });

  it('resolves a launcher path delivered as a Buffer (locale-independent)', async () => {
    await coldLauncherCache();
    vi.mocked(cpExecFile).mockImplementationOnce(((
      _cmd: string,
      _args: unknown,
      _opts: unknown,
      cb?: (e: unknown, o: Buffer, s: Buffer) => void,
    ) => {
      cb?.(null, Buffer.from(`${FAKE_CLAUDE_CMD}

`, 'utf8'), Buffer.alloc(0));
      return { on: vi.fn() };
    }) as unknown as typeof cpExecFile);

    expect(await Claude.which()).toBe(FAKE_CLAUDE_CMD);
  });
});

describe('Claude.applyConfigDir — per-project cliPath', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('projects the project-scoped cliPath onto Claude.command', async () => {
    const { readMergedSettings } = await import('../features/settings');
    vi.mocked(readMergedSettings).mockResolvedValue({
      settings: { cliPath: '/home/u/proj/.bin/claude' },
      overrides: ['cliPath'],
    });

    await Claude.applyConfigDir('/home/u/proj');

    expect(Claude.command).toBe('/home/u/proj/.bin/claude');
    expect(readMergedSettings).toHaveBeenCalledWith('/home/u/proj');
  });

  it('falls back to the global cliPath when the project sets none', async () => {
    const { readMergedSettings } = await import('../features/settings');
    vi.mocked(readMergedSettings).mockResolvedValue({
      settings: { cliPath: '/usr/local/bin/claude' },
      overrides: [],
    });

    await Claude.applyConfigDir('/home/u/other');

    expect(Claude.command).toBe('/usr/local/bin/claude');
  });

  it('falls back to a bare "claude" when nothing is configured', async () => {
    const { readMergedSettings } = await import('../features/settings');
    vi.mocked(readMergedSettings).mockResolvedValue({
      settings: { cliPath: null },
      overrides: [],
    });

    await Claude.applyConfigDir('/home/u/plain');

    expect(Claude.command).toBe('claude');
  });

  it('drops a stale win32 launcher cache when the project changes the CLI', async () => {
    const { readMergedSettings } = await import('../features/settings');
    vi.mocked(readMergedSettings).mockResolvedValue({
      settings: { cliPath: '/a/claude' },
      overrides: ['cliPath'],
    });
    await Claude.applyConfigDir('/proj-a');
    await Claude.which(); // populates the win32 resolved-path cache

    vi.mocked(readMergedSettings).mockResolvedValue({
      settings: { cliPath: '/b/claude' },
      overrides: ['cliPath'],
    });
    await Claude.applyConfigDir('/proj-b');

    expect(Claude.command).toBe('/b/claude');
  });
});
