import { describe, it, expect, vi, afterEach } from 'vitest';

// customIntegration.ts does `const execFileAsync = promisify(execFile);` at
// module load time. Node's real child_process.execFile carries a
// `util.promisify.custom` tag that makes the promisified variant resolve
// `{ stdout, stderr }` instead of the callback's single "value" argument —
// but a plain vi.fn() mock has no such tag. Rather than reconstructing that
// tagging dance, we make `promisify` an identity function so
// `execFileAsync === execFile`, and directly control what our execFile mock
// resolves to (mirroring what execFileAsync would have resolved to).
vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return {
    ...actual,
    promisify: ((fn: unknown) => fn) as typeof actual.promisify,
  };
});

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  lstat: vi.fn(),
  constants: { X_OK: 1 },
}));

import { execFile as cpExecFile } from 'child_process';
import { access as fsAccess, lstat as fsLstat } from 'fs/promises';
import {
  TargetPathArgument,
  parseCustomIntegrationArguments,
  expandTargetPathArgument,
  hasTargetPathArgument,
  validateCustomIntegrationPath,
} from '../customIntegration';

function statResult(overrides: Partial<{ isFile: boolean; isSymbolicLink: boolean; isDirectory: boolean }>) {
  const { isFile = false, isSymbolicLink = false, isDirectory = false } = overrides;
  return {
    isFile: () => isFile,
    isSymbolicLink: () => isSymbolicLink,
    isDirectory: () => isDirectory,
  };
}

describe('customIntegration', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  afterEach(() => {
    vi.clearAllMocks();
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
      originalPlatform = undefined;
    }
  });

  function setPlatform(platform: NodeJS.Platform) {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: platform });
  }

  describe('TargetPathArgument', () => {
    it('is the %TARGET_PATH% token', () => {
      expect(TargetPathArgument).toBe('%TARGET_PATH%');
    });
  });

  describe('parseCustomIntegrationArguments', () => {
    it('splits plain space-separated arguments', () => {
      expect(parseCustomIntegrationArguments('foo bar baz')).toEqual(['foo', 'bar', 'baz']);
    });

    it('keeps a double-quoted argument containing spaces as one token', () => {
      expect(parseCustomIntegrationArguments('"foo bar" baz')).toEqual(['foo bar', 'baz']);
    });

    it('keeps a single-quoted argument containing spaces as one token', () => {
      expect(parseCustomIntegrationArguments("'foo bar' baz")).toEqual(['foo bar', 'baz']);
    });

    it('parses the %TARGET_PATH% token when quoted', () => {
      expect(parseCustomIntegrationArguments('--wait "%TARGET_PATH%"')).toEqual(['--wait', '%TARGET_PATH%']);
    });

    it('returns an empty array for an empty string', () => {
      expect(parseCustomIntegrationArguments('')).toEqual([]);
    });

    it('collapses repeated whitespace between tokens', () => {
      expect(parseCustomIntegrationArguments('  foo    bar  ')).toEqual(['foo', 'bar']);
    });
  });

  describe('expandTargetPathArgument', () => {
    it('replaces an argv entry that is exactly the token', () => {
      expect(expandTargetPathArgument(['%TARGET_PATH%'], '/tmp/file.ts')).toEqual(['/tmp/file.ts']);
    });

    it('replaces the token embedded within a larger argument', () => {
      expect(expandTargetPathArgument(['--file=%TARGET_PATH%'], '/tmp/file.ts')).toEqual([
        '--file=/tmp/file.ts',
      ]);
    });

    it('replaces multiple occurrences of the token within one argument', () => {
      expect(expandTargetPathArgument(['%TARGET_PATH%/%TARGET_PATH%'], 'p')).toEqual(['p/p']);
    });

    it('leaves arguments without the token unchanged', () => {
      expect(expandTargetPathArgument(['--wait', '-n'], '/tmp/file.ts')).toEqual(['--wait', '-n']);
    });

    it('expands the token across a full argv while preserving other args', () => {
      expect(expandTargetPathArgument(['--wait', '%TARGET_PATH%', '--reuse-window'], '/tmp/file.ts')).toEqual([
        '--wait',
        '/tmp/file.ts',
        '--reuse-window',
      ]);
    });
  });

  describe('hasTargetPathArgument', () => {
    it('returns true when the token is present', () => {
      expect(hasTargetPathArgument(['--wait', '%TARGET_PATH%'])).toBe(true);
    });

    it('returns true when the token is embedded in a larger argument', () => {
      expect(hasTargetPathArgument(['--file=%TARGET_PATH%'])).toBe(true);
    });

    it('returns false when the token is absent', () => {
      expect(hasTargetPathArgument(['--wait', '-n'])).toBe(false);
    });

    it('returns false for an empty argv', () => {
      expect(hasTargetPathArgument([])).toBe(false);
    });
  });

  describe('validateCustomIntegrationPath', () => {
    it('is invalid for an empty path', async () => {
      const result = await validateCustomIntegrationPath('');
      expect(result).toEqual({ isValid: false });
      expect(fsLstat).not.toHaveBeenCalled();
    });

    it('is invalid when the path does not exist', async () => {
      setPlatform('darwin');
      vi.mocked(fsLstat).mockRejectedValue(new Error('ENOENT'));

      const result = await validateCustomIntegrationPath('/no/such/path');
      expect(result).toEqual({ isValid: false });
    });

    it('is valid for an executable regular file on linux', async () => {
      setPlatform('linux');
      vi.mocked(fsLstat).mockResolvedValue(statResult({ isFile: true }) as never);
      vi.mocked(fsAccess).mockResolvedValue(undefined);

      const result = await validateCustomIntegrationPath('/usr/local/bin/subl');
      expect(result).toEqual({ isValid: true });
    });

    it('is invalid for a regular file without execute permission on linux', async () => {
      setPlatform('linux');
      vi.mocked(fsLstat).mockResolvedValue(statResult({ isFile: true }) as never);
      vi.mocked(fsAccess).mockRejectedValue(new Error('EACCES'));

      const result = await validateCustomIntegrationPath('/usr/local/bin/subl');
      expect(result).toEqual({ isValid: false });
    });

    it('is valid for an executable symlink', async () => {
      setPlatform('linux');
      vi.mocked(fsLstat).mockResolvedValue(statResult({ isSymbolicLink: true }) as never);
      vi.mocked(fsAccess).mockResolvedValue(undefined);

      const result = await validateCustomIntegrationPath('/usr/local/bin/subl-symlink');
      expect(result).toEqual({ isValid: true });
    });

    it('is valid for a .exe on windows', async () => {
      setPlatform('win32');
      vi.mocked(fsLstat).mockResolvedValue(statResult({ isFile: true }) as never);
      vi.mocked(fsAccess).mockResolvedValue(undefined);

      const result = await validateCustomIntegrationPath('C:\\Tools\\subl.exe');
      expect(result).toEqual({ isValid: true });
    });

    it('is invalid for a .bat wrapper on windows even if "executable"', async () => {
      setPlatform('win32');
      vi.mocked(fsLstat).mockResolvedValue(statResult({ isFile: true }) as never);
      vi.mocked(fsAccess).mockResolvedValue(undefined);

      const result = await validateCustomIntegrationPath('C:\\Tools\\launch.bat');
      expect(result).toEqual({ isValid: false });
    });

    it('resolves a macOS .app bundle via its Info.plist bundle id (mdls)', async () => {
      setPlatform('darwin');
      vi.mocked(fsLstat).mockResolvedValue(statResult({ isDirectory: true }) as never);
      vi.mocked(cpExecFile).mockResolvedValue({ stdout: 'com.sublimetext.4\n', stderr: '' } as never);

      const result = await validateCustomIntegrationPath('/Applications/Sublime Text.app');
      expect(result).toEqual({ isValid: true, bundleID: 'com.sublimetext.4' });
      expect(cpExecFile).toHaveBeenCalledWith('mdls', [
        '-name',
        'kMDItemCFBundleIdentifier',
        '-raw',
        '/Applications/Sublime Text.app',
      ]);
    });

    it('is invalid when mdls reports no bundle id for a .app directory', async () => {
      setPlatform('darwin');
      vi.mocked(fsLstat).mockResolvedValue(statResult({ isDirectory: true }) as never);
      vi.mocked(cpExecFile).mockResolvedValue({ stdout: '(null)', stderr: '' } as never);

      const result = await validateCustomIntegrationPath('/Applications/NotReally.app');
      expect(result).toEqual({ isValid: false, bundleID: undefined });
    });

    it('is invalid when mdls fails for a .app directory', async () => {
      setPlatform('darwin');
      vi.mocked(fsLstat).mockResolvedValue(statResult({ isDirectory: true }) as never);
      vi.mocked(cpExecFile).mockRejectedValue(new Error('mdls failed'));

      const result = await validateCustomIntegrationPath('/Applications/Broken.app');
      expect(result).toEqual({ isValid: false, bundleID: undefined });
    });

    it('is invalid for a non-.app directory on macOS', async () => {
      setPlatform('darwin');
      vi.mocked(fsLstat).mockResolvedValue(statResult({ isDirectory: true }) as never);

      const result = await validateCustomIntegrationPath('/Applications/JustAFolder');
      expect(result).toEqual({ isValid: false, bundleID: undefined });
      expect(cpExecFile).not.toHaveBeenCalled();
    });

    it('is invalid for a directory on non-macOS platforms', async () => {
      setPlatform('linux');
      vi.mocked(fsLstat).mockResolvedValue(statResult({ isDirectory: true }) as never);

      const result = await validateCustomIntegrationPath('/opt/some-dir.app');
      expect(result).toEqual({ isValid: false });
      expect(cpExecFile).not.toHaveBeenCalled();
    });
  });
});
