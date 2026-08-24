import { describe, it, expect, vi, afterEach } from 'vitest';

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
