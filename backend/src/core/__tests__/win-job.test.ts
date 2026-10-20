import { EventEmitter } from 'events';
import { describe, it, expect, vi, afterEach } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

// Mock fs so the BASH_ENV tests can decide whether the shipped script "exists"
// without depending on where the suite happens to run from.
vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }));

// bashEnvScriptPath resolves import.meta.url through fileURLToPath, which yields
// a POSIX path when the suite runs on mac/linux — the win32 branch it feeds needs
// a drive-letter path to mean anything, so mock fileURLToPath to give it one
// regardless of the host OS the suite happens to run on.
vi.mock('url', () => ({
  fileURLToPath: vi.fn(() => 'C:\\Users\\me\\ccg\\win-bash-env.sh'),
}));

import { existsSync } from 'fs';
import { buildWin32CmdLine, toMsysPath, utf8BashEnv } from '../win-job';

describe('buildWin32CmdLine', () => {
  it('joins command + args with single spaces (mirrors Node win32 shell:true)', () => {
    expect(buildWin32CmdLine('claude', ['-p', '--verbose'])).toBe('claude -p --verbose');
  });

  it('reproduces the chat CLI invocation verbatim (no per-arg re-quoting)', () => {
    const args = [
      '-p', '--output-format', 'stream-json', '--input-format', 'stream-json',
      '--verbose', '--include-partial-messages', '--permission-prompt-tool', 'stdio',
      '--session-id', '795f99a6-b973-4963-ba19-84f095c1ff74',
    ];
    expect(buildWin32CmdLine('claude', args)).toBe(
      'claude -p --output-format stream-json --input-format stream-json --verbose ' +
        '--include-partial-messages --permission-prompt-tool stdio ' +
        '--session-id 795f99a6-b973-4963-ba19-84f095c1ff74',
    );
  });

  it('returns the bare command when there are no args', () => {
    expect(buildWin32CmdLine('claude', [])).toBe('claude');
  });
});

// The PowerShell check keeps its answer in module state, so each test loads the module
// afresh. Otherwise the answer one test settled would decide the next one's.
async function loadWinJob() {
  vi.resetModules();
  return import('../win-job');
}

/** A child process that reports `outcome` on the next tick, once the caller has attached its listeners. */
function fakeChild(outcome: { exit?: [number | null, string | null]; error?: Error; killed?: boolean }) {
  const child = new EventEmitter() as EventEmitter & { killed: boolean };
  child.killed = outcome.killed ?? false;
  queueMicrotask(() => {
    if (outcome.error) child.emit('error', outcome.error);
    else child.emit('exit', ...(outcome.exit ?? [0, null]));
  });
  return child;
}

describe('checkPowerShell', () => {
  const env = { PATH: 'C:\\tools' };

  afterEach(() => {
    spawnMock.mockReset();
    vi.restoreAllMocks();
  });

  it('reports PowerShell usable when it exits with code 0', async () => {
    const { checkPowerShell, POWERSHELL_CHECK_TIMEOUT_MS } = await loadWinJob();
    spawnMock.mockReturnValue(fakeChild({ exit: [0, null] }));

    await expect(checkPowerShell(env)).resolves.toBe(true);
    // The environment chat will spawn with, because powershell.exe is found through its PATH,
    // and a bound so a PowerShell that never exits cannot hold the backend back.
    expect(spawnMock).toHaveBeenCalledWith(
      'powershell.exe',
      expect.any(Array),
      expect.objectContaining({ shell: false, stdio: 'ignore', env, timeout: POWERSHELL_CHECK_TIMEOUT_MS }),
    );
  });

  it('reports it unusable when the launch throws spawn UNKNOWN', async () => {
    const { checkPowerShell } = await loadWinJob();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    spawnMock.mockImplementation(() => {
      throw Object.assign(new Error('spawn UNKNOWN'), { code: 'UNKNOWN' });
    });

    await expect(checkPowerShell(env)).resolves.toBe(false);
    expect(logged).toHaveBeenCalledWith('[node-backend]', expect.stringContaining('spawn UNKNOWN'));
  });

  it('reports it unusable when the launch fails with an error event', async () => {
    const { checkPowerShell } = await loadWinJob();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    spawnMock.mockReturnValue(fakeChild({ error: Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }) }));

    await expect(checkPowerShell(env)).resolves.toBe(false);
  });

  it('reports it unusable when PowerShell exits with a non-zero code', async () => {
    const { checkPowerShell } = await loadWinJob();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    spawnMock.mockReturnValue(fakeChild({ exit: [1, null] }));

    await expect(checkPowerShell(env)).resolves.toBe(false);
  });

  it('reports it unusable, and says why, when PowerShell was stopped for not exiting', async () => {
    const { checkPowerShell } = await loadWinJob();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    spawnMock.mockReturnValue(fakeChild({ exit: [null, 'SIGTERM'], killed: true }));

    await expect(checkPowerShell(env)).resolves.toBe(false);
    expect(logged).toHaveBeenCalledWith('[node-backend]', expect.stringContaining('did not exit within'));
  });
});

describe('assertPowerShellUsable', () => {
  afterEach(() => {
    spawnMock.mockReset();
    vi.restoreAllMocks();
  });

  it('lets a feature go ahead before any check has run', async () => {
    const { assertPowerShellUsable, isPowerShellUsable } = await loadWinJob();

    expect(isPowerShellUsable()).toBe(true);
    expect(() => assertPowerShellUsable('Playing a sound')).not.toThrow();
  });

  it('lets a feature go ahead after PowerShell was found usable', async () => {
    const { checkPowerShell, assertPowerShellUsable } = await loadWinJob();
    spawnMock.mockReturnValue(fakeChild({ exit: [0, null] }));
    await checkPowerShell();

    expect(() => assertPowerShellUsable('Playing a sound')).not.toThrow();
  });

  it('stops a feature after PowerShell was found blocked, naming what it was for', async () => {
    const { checkPowerShell, assertPowerShellUsable, isPowerShellUsable } = await loadWinJob();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    spawnMock.mockImplementation(() => {
      throw Object.assign(new Error('spawn UNKNOWN'), { code: 'UNKNOWN' });
    });
    await checkPowerShell();

    expect(isPowerShellUsable()).toBe(false);
    expect(() => assertPowerShellUsable('Playing a sound')).toThrow(
      'Playing a sound needs PowerShell, which cannot be launched on this computer.',
    );
  });
});

describe('spawnWin32JobCli', () => {
  const options = { cwd: 'C:\\project', env: { PATH: 'C:\\tools' } };

  afterEach(() => {
    spawnMock.mockReset();
    vi.restoreAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('uses the Job Object wrapper before any check has run', async () => {
    const { spawnWin32JobCli } = await loadWinJob();
    spawnWin32JobCli('claude', ['-p', 'hello'], 'session-1', options);

    expect(spawnMock).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-File', 'C:\\Users\\me\\ccg\\win-bash-env.sh', 'session-1']),
      expect.objectContaining({ shell: false, env: expect.objectContaining({ CCG_JOB_CMDLINE: 'claude -p hello' }) }),
    );
  });

  it('uses the Job Object wrapper after PowerShell was found usable', async () => {
    const { checkPowerShell, spawnWin32JobCli } = await loadWinJob();
    spawnMock.mockReturnValueOnce(fakeChild({ exit: [0, null] }));
    await checkPowerShell();
    spawnMock.mockClear();

    spawnWin32JobCli('claude', ['-p', 'hello'], 'session-1', options);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith('powershell.exe', expect.any(Array), expect.objectContaining({ shell: false }));
  });

  it('falls back to the plain shell spawn after PowerShell was found blocked', async () => {
    const { checkPowerShell, spawnWin32JobCli } = await loadWinJob();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    spawnMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('spawn UNKNOWN'), { code: 'UNKNOWN' });
    });
    await checkPowerShell();
    spawnMock.mockClear();

    spawnWin32JobCli('claude', ['-p', 'hello'], 'session-1', options);

    // Straight to the CLI: no second PowerShell launch to find out again.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith('claude', ['-p', 'hello'], expect.objectContaining({ shell: true }));
  });
});

describe('toMsysPath', () => {
  it('rewrites a drive letter into the /c/ form git-bash resolves', () => {
    expect(toMsysPath('C:\\Users\\me\\ccg\\win-bash-env.sh'))
      .toBe('/c/Users/me/ccg/win-bash-env.sh');
  });

  it('lowercases the drive letter (bash mount points are lowercase)', () => {
    expect(toMsysPath('D:\\tools\\x.sh')).toBe('/d/tools/x.sh');
  });

  it('accepts a forward-slash drive path, which is what import.meta.url yields', () => {
    expect(toMsysPath('C:/Users/me/x.sh')).toBe('/c/Users/me/x.sh');
  });

  it('still normalizes separators on a path that carries no drive letter', () => {
    expect(toMsysPath('\\\\server\\share\\x.sh')).toBe('//server/share/x.sh');
  });
});

/**
 * The CLI's Bash tool decodes its subprocess output as UTF-8, but Windows console
 * programs print localized text in the legacy OEM codepage, so non-ASCII arrives as
 * U+FFFD. Setting the codepage when we spawn the CLI does NOT survive — measured on
 * ko-KR, it reads 65001 in cmd and in a bash launched from it, but drops back to 949
 * once the CLI launches the tool's own bash. bash sources $BASH_ENV on every
 * non-interactive start, which is the one hook that runs INSIDE that bash.
 */
describe('utf8BashEnv', () => {
  const realPlatform = process.platform;

  const setPlatform = (value: string) => {
    Object.defineProperty(process, 'platform', { value, configurable: true });
  };

  afterEach(() => {
    setPlatform(realPlatform);
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('points BASH_ENV at the shipped script, in the path form bash understands', () => {
    setPlatform('win32');
    const result = utf8BashEnv({});
    expect(result.BASH_ENV).toMatch(/^\/[a-z]\//);
    expect(result.BASH_ENV).toContain('win-bash-env.sh');
  });

  it('carries an existing BASH_ENV aside so the script can source it back', () => {
    setPlatform('win32');
    const result = utf8BashEnv({ BASH_ENV: '/home/me/.bashenv' });
    expect(result.CCG_PREV_BASH_ENV).toBe('/home/me/.bashenv');
    expect(result.BASH_ENV).toContain('win-bash-env.sh');
  });

  it('leaves CCG_PREV_BASH_ENV unset when the user had no BASH_ENV', () => {
    setPlatform('win32');
    expect(utf8BashEnv({})).not.toHaveProperty('CCG_PREV_BASH_ENV');
  });

  it('does nothing off win32, where console codepages do not exist', () => {
    setPlatform('darwin');
    expect(utf8BashEnv({ BASH_ENV: '/home/me/.bashenv' })).toEqual({});
  });

  it('does nothing when the script is missing — a lost asset must never break chat', () => {
    setPlatform('win32');
    vi.mocked(existsSync).mockReturnValue(false);
    expect(utf8BashEnv({})).toEqual({});
  });
});
