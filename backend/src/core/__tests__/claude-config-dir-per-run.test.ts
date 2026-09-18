import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Every run of `claude` settles which Claude data directory it belongs to first.
 *
 * `process.env` holds one CLAUDE_CONFIG_DIR for the whole backend, so a run that does not
 * settle it does not get "no directory" — it gets whichever project last set one. That is
 * how it stood: of the sixteen places that run `claude` or `ccb`, eleven never called
 * applyConfigDir, and `auth login`, which WRITES the credential, was among them.
 *
 * Settling it inside exec/spawnAuthed rather than at each call site is the point. A rule that
 * every caller has to remember is a rule eleven callers forgot.
 */

const resolveClaudeConfigDirOverride = vi.hoisted(() => vi.fn());
const runExecFile = vi.hoisted(() => vi.fn());

vi.mock('../features/settings', () => ({
  readSettingsFile: vi.fn().mockResolvedValue({ cliPath: null }),
  readMergedSettings: vi.fn().mockResolvedValue({ settings: { cliPath: null }, overrides: [] }),
  resolveClaudeConfigDirOverride,
}));

vi.mock('../features/claude-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/claude-settings')>()),
  getStrippableAuthEnvKeys: vi.fn().mockResolvedValue([]),
}));

const { Claude } = await import('../claude');

/**
 * Stand in for the actual child spawn.
 *
 * `runExecFile` is the private funnel every non-win32 exec ends at, so replacing it observes
 * the call without a real process — and, more to the point, without the CLAUDE_CONFIG_DIR
 * read happening for real against the developer's own machine.
 */
beforeEach(() => {
  resolveClaudeConfigDirOverride.mockReset();
  runExecFile.mockReset();
  runExecFile.mockResolvedValue({ stdout: '', stderr: '' });
  (Claude as unknown as { runExecFile: unknown }).runExecFile = runExecFile;
  delete process.env.CLAUDE_CONFIG_DIR;
});

describe('Claude.exec settles the config directory before running', () => {
  it('applies the override of the directory it was given', async () => {
    resolveClaudeConfigDirOverride.mockResolvedValue('/data/project-a');

    await Claude.exec(['--version'], { cwd: '/project/a' });

    expect(resolveClaudeConfigDirOverride).toHaveBeenCalledWith('/project/a');
    expect(process.env.CLAUDE_CONFIG_DIR).toBe('/data/project-a');
  });

  it('does not leave the previous project\'s directory in place', async () => {
    resolveClaudeConfigDirOverride.mockResolvedValue('/data/project-a');
    await Claude.exec(['--version'], { cwd: '/project/a' });
    expect(process.env.CLAUDE_CONFIG_DIR).toBe('/data/project-a');

    // Project B overrides nothing. Before this change the run simply skipped the step, and
    // B's `claude` read A's credentials.
    resolveClaudeConfigDirOverride.mockResolvedValue(null);
    await Claude.exec(['--version'], { cwd: '/project/b' });

    expect(process.env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it('resolves to the global value when no directory is given', async () => {
    resolveClaudeConfigDirOverride.mockResolvedValue('/data/project-a');
    await Claude.exec(['--version'], { cwd: '/project/a' });

    resolveClaudeConfigDirOverride.mockResolvedValue(null);
    await Claude.exec(['--version']);

    // "No project" is an answer, not a reason to skip: account management asks this way on
    // purpose, and it must not inherit a project's directory.
    expect(resolveClaudeConfigDirOverride).toHaveBeenLastCalledWith(undefined);
    expect(process.env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });
});

describe('Claude.execAuthed passes its project through', () => {
  it('settles the directory of the workingDir argument, not of an absent cwd', async () => {
    resolveClaudeConfigDirOverride.mockResolvedValue('/data/project-a');

    // Callers name the project in `workingDir` and mostly leave `cwd` empty. Reading only
    // `cwd` would reset every one of them to global.
    await Claude.execAuthed(['auth', 'status'], '/project/a', { timeout: 1000 });

    expect(resolveClaudeConfigDirOverride).toHaveBeenCalledWith('/project/a');
    expect(process.env.CLAUDE_CONFIG_DIR).toBe('/data/project-a');
  });
});
