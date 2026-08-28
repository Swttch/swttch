import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';

// resolveApp.ts does `const execFileAsync = promisify(execFile);` at module
// load time. Node's real child_process.execFile carries a
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
  readdir: vi.fn(),
}));

import { execFile as cpExecFile } from 'child_process';
import { access as fsAccess, readdir as fsReaddir } from 'fs/promises';
import { resolveLinuxApp } from '../resolveApp';
import type { MacDetection, LinuxDetection } from '../resolveApp';

const APPLICATIONS_DIR = '/Applications';
const HOME_APPLICATIONS_DIR = join(homedir(), 'Applications');

/** Wires `defaults read <appPath>/Contents/Info CFBundleIdentifier` and `which <binary>`. */
function setupExecFile(opts: {
  bundleIdByAppPath?: Record<string, string | null>;
  whichByBinary?: Record<string, string | null>;
}) {
  vi.mocked(cpExecFile).mockImplementation(((cmd: string, args: string[]) => {
    if (cmd === 'defaults') {
      const infoPath = args[1];
      // The path was built with join(), so its separator is the host's — match
      // either, or this strips nothing on Windows and every lookup misses.
      const appPath = infoPath.replace(/[\\/]Contents[\\/]Info$/, '');
      const id = opts.bundleIdByAppPath?.[appPath];
      if (id) return Promise.resolve({ stdout: `${id}\n`, stderr: '' });
      return Promise.reject(new Error(`defaults read failed for ${appPath}`));
    }
    if (cmd === 'which') {
      const binary = args[0];
      const path = opts.whichByBinary?.[binary];
      if (path) return Promise.resolve({ stdout: `${path}\n`, stderr: '' });
      return Promise.reject(new Error(`which: no ${binary} in PATH`));
    }
    return Promise.reject(new Error(`unexpected command: ${cmd}`));
  }) as never);
}

/** Wires `readdir(dir)` for the given directories; any other dir rejects (ENOENT). */
function setupReaddir(byDir: Record<string, string[]>) {
  vi.mocked(fsReaddir).mockImplementation((async (dir: string) => {
    const entries = byDir[String(dir)];
    if (!entries) throw new Error('ENOENT');
    return entries;
  }) as never);
}

describe('resolveApp', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveMacApp', () => {
    // The bundle-id inventory is memoized at module scope (built once per
    // module load), so each test needs a fresh module instance to control
    // its own readdir/execFile fixtures without bleeding into other tests.
    beforeEach(() => {
      vi.resetModules();
    });

    it('matches an installed bundle id case-insensitively', async () => {
      setupReaddir({
        [APPLICATIONS_DIR]: ['RubyMine.app', 'Other.app'],
        [HOME_APPLICATIONS_DIR]: [],
      });
      setupExecFile({
        bundleIdByAppPath: {
          [join(APPLICATIONS_DIR, 'RubyMine.app')]: 'com.jetbrains.rubymine',
          [join(APPLICATIONS_DIR, 'Other.app')]: 'com.example.other',
        },
      });

      const { resolveMacApp } = await import('../resolveApp');
      const mac: MacDetection = { bundleIds: ['com.jetbrains.RubyMine'] };
      const result = await resolveMacApp(mac);

      expect(result).toBe(join(APPLICATIONS_DIR, 'RubyMine.app'));
    });

    it('checks bundle-id candidates in order and returns the first installed match', async () => {
      setupReaddir({
        [APPLICATIONS_DIR]: ['IntelliJIDEA.app'],
        [HOME_APPLICATIONS_DIR]: [],
      });
      setupExecFile({
        bundleIdByAppPath: {
          [join(APPLICATIONS_DIR, 'IntelliJIDEA.app')]: 'com.jetbrains.intellij.ce',
        },
      });

      const { resolveMacApp } = await import('../resolveApp');
      const result = await resolveMacApp({
        bundleIds: ['com.jetbrains.intellij', 'com.jetbrains.intellij.ce'],
      });

      expect(result).toBe(join(APPLICATIONS_DIR, 'IntelliJIDEA.app'));
    });

    it('falls back to a conventional app-name path when no bundle id matches', async () => {
      setupReaddir({ [APPLICATIONS_DIR]: [], [HOME_APPLICATIONS_DIR]: [] });
      setupExecFile({});
      vi.mocked(fsAccess).mockImplementation((async (p: string) => {
        if (String(p) === join(APPLICATIONS_DIR, 'Fleet.app')) return undefined;
        throw new Error('ENOENT');
      }) as never);

      const { resolveMacApp } = await import('../resolveApp');
      const mac: MacDetection = { bundleIds: ['Fleet.app'], appNames: ['Fleet'] };
      const result = await resolveMacApp(mac);

      expect(result).toBe(join(APPLICATIONS_DIR, 'Fleet.app'));
    });

    it('returns null when neither the bundle-id inventory nor app-name fallback match', async () => {
      setupReaddir({ [APPLICATIONS_DIR]: [], [HOME_APPLICATIONS_DIR]: [] });
      setupExecFile({});
      vi.mocked(fsAccess).mockRejectedValue(new Error('ENOENT'));

      const { resolveMacApp } = await import('../resolveApp');
      const result = await resolveMacApp({
        bundleIds: ['com.nonexistent.app'],
        appNames: ['Nonexistent'],
      });

      expect(result).toBeNull();
    });

    it('tolerates a missing ~/Applications directory and still resolves from /Applications', async () => {
      setupReaddir({ [APPLICATIONS_DIR]: ['WebStorm.app'] });
      setupExecFile({
        bundleIdByAppPath: { [join(APPLICATIONS_DIR, 'WebStorm.app')]: 'com.jetbrains.WebStorm' },
      });

      const { resolveMacApp } = await import('../resolveApp');
      const result = await resolveMacApp({ bundleIds: ['com.jetbrains.WebStorm'] });

      expect(result).toBe(join(APPLICATIONS_DIR, 'WebStorm.app'));
    });

    it('memoizes the inventory scan so a second resolveMacApp call does not re-scan the filesystem', async () => {
      setupReaddir({ [APPLICATIONS_DIR]: ['Cursor.app'], [HOME_APPLICATIONS_DIR]: [] });
      setupExecFile({
        bundleIdByAppPath: { [join(APPLICATIONS_DIR, 'Cursor.app')]: 'com.todesktop.230313mzl4w4u92' },
      });

      const { resolveMacApp } = await import('../resolveApp');
      await resolveMacApp({ bundleIds: ['com.todesktop.230313mzl4w4u92'] });
      await resolveMacApp({ bundleIds: ['com.todesktop.230313mzl4w4u92'] });

      // One readdir per scanned Applications directory (4 total: /Applications,
      // ~/Applications, /System/Applications, /System/Applications/Utilities),
      // not once per resolveMacApp call.
      expect(fsReaddir).toHaveBeenCalledTimes(4);
    });
  });

  describe('resolveLinuxApp', () => {
    it('resolves via the first binary found on PATH', async () => {
      setupExecFile({ whichByBinary: { rubymine: '/usr/local/bin/rubymine' } });

      const linux: LinuxDetection = { binaries: ['rubymine'] };
      const result = await resolveLinuxApp(linux);

      expect(result).toBe('/usr/local/bin/rubymine');
    });

    it('tries the next binary candidate when the first is not on PATH', async () => {
      setupExecFile({ whichByBinary: { charm: '/usr/local/bin/charm' } });

      const linux: LinuxDetection = { binaries: ['pycharm', 'charm'] };
      const result = await resolveLinuxApp(linux);

      expect(result).toBe('/usr/local/bin/charm');
    });

    it('returns null when none of the candidate binaries are on PATH', async () => {
      setupExecFile({});

      const linux: LinuxDetection = { binaries: ['nope1', 'nope2'] };
      const result = await resolveLinuxApp(linux);

      expect(result).toBeNull();
    });
  });
});
