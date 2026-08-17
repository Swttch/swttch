import { describe, it, expect } from 'vitest';
import {
  detectRuntimeManager,
  detectLibraryManager,
  detectAppChannel,
  detectInstallCoordinate,
  toPackageManager,
  launcherFor,
  npmPrefixFor,
} from '../install-coordinate';
import { RuntimeManager, LibraryManager, AppChannel, PackageManager } from '../../shared';

const HOME = '/Users/jake';

describe('detectRuntimeManager — who installed Node', () => {
  it('recognises the version managers by the directories they create', () => {
    const cases: Array<[string, RuntimeManager]> = [
      ['/Users/jake/.volta/tools/image/node/24.7.0/bin/node', RuntimeManager.VOLTA],
      ['/Users/jake/.nvm/versions/node/v22.14.0/bin/node', RuntimeManager.NVM],
      ['/Users/jake/.asdf/installs/nodejs/22.0.0/bin/node', RuntimeManager.ASDF],
      ['/Users/jake/.local/share/mise/installs/node/22.0.0/bin/node', RuntimeManager.MISE],
      ['/Users/jake/.nodenv/versions/22.0.0/bin/node', RuntimeManager.NODENV],
      ['/Users/jake/.proto/tools/node/22.0.0/bin/node', RuntimeManager.PROTO],
      ['/Users/jake/.nvs/node/22.0.0/x64/bin/node', RuntimeManager.NVS],
      ['/opt/homebrew/bin/node', RuntimeManager.HOMEBREW],
      ['/usr/local/bin/node', RuntimeManager.SYSTEM],
      ['/usr/bin/node', RuntimeManager.SYSTEM],
    ];
    for (const [path, expected] of cases) {
      expect(detectRuntimeManager([path], HOME), path).toBe(expected);
    }
  });

  // fnm's macOS default sits under a directory WITH SPACES, which is also the
  // path that broke a login-shell command line elsewhere in this codebase.
  it('recognises fnm including its space-bearing macOS location', () => {
    const fnm = '/Users/jake/Library/Application Support/fnm/node-versions/v22.0.0/installation/bin/node';
    expect(detectRuntimeManager([fnm], HOME)).toBe(RuntimeManager.FNM);
    expect(detectRuntimeManager(['/Users/jake/.fnm/aliases/default/bin/node'], HOME)).toBe(RuntimeManager.FNM);
  });

  // nvm is a shell function, never a binary on PATH, so `command -v nvm` finds
  // nothing even on a machine that uses it. Only its version directory can say.
  it('identifies nvm from its version directory, which is the only evidence there is', () => {
    expect(detectRuntimeManager(['/Users/jake/.nvm/versions/node/v20.0.0/bin/node'], HOME)).toBe(
      RuntimeManager.NVM,
    );
  });

  it('is UNKNOWN when nothing matches', () => {
    expect(detectRuntimeManager([], HOME)).toBe(RuntimeManager.UNKNOWN);
    expect(detectRuntimeManager(['/weird/place/node'], HOME)).toBe(RuntimeManager.UNKNOWN);
  });
});

describe('detectLibraryManager — who owns global npm packages', () => {
  // THE bug this split exists for. Both paths are under ~/.volta, and a flat
  // detector called both "volta" — so removing with `volta uninstall` cleared
  // the package store and left the Node's npm globals untouched, still
  // installed, still reported.
  it('separates volta’s own store from npm globals under volta’s Node', () => {
    const voltaStore = '/Users/jake/.volta/tools/image/packages/@swttch/extend-kit/bin/ccb';
    const npmUnderVolta = '/Users/jake/.volta/tools/image/node/24.7.0/lib/node_modules/@swttch/extend-kit';
    expect(detectLibraryManager([voltaStore], HOME)).toBe(LibraryManager.VOLTA);
    expect(detectLibraryManager([npmUnderVolta], HOME)).toBe(LibraryManager.NPM);
  });

  it('recognises each store by the directory it owns', () => {
    const cases: Array<[string, LibraryManager]> = [
      ['/Users/jake/Library/pnpm/global/5/node_modules/@swttch/extend-kit', LibraryManager.PNPM],
      ['/Users/jake/.config/yarn/global/node_modules/@swttch/extend-kit', LibraryManager.YARN],
      ['/Users/jake/.bun/install/global/node_modules/@swttch/extend-kit', LibraryManager.BUN],
      ['/opt/homebrew/lib/node_modules/@swttch/extend-kit', LibraryManager.NPM],
      ['/Users/jake/.npm-global/lib/node_modules/@swttch/extend-kit', LibraryManager.NPM],
      ['C:\\Users\\jake\\AppData\\Roaming\\npm\\node_modules\\@swttch\\extend-kit', LibraryManager.NPM],
    ];
    for (const [path, expected] of cases) {
      expect(detectLibraryManager([path], HOME), path).toBe(expected);
    }
  });

  it('is UNKNOWN for a path that is in no package store', () => {
    expect(detectLibraryManager(['/Users/jake/.local/bin/claude'], HOME)).toBe(LibraryManager.UNKNOWN);
  });
});

describe('detectAppChannel — who shipped the claude app', () => {
  it('recognises the app channels', () => {
    expect(detectAppChannel(['/Users/jake/.local/share/claude/claude'], HOME)).toBe(AppChannel.NATIVE);
    expect(detectAppChannel(['/Users/jake/.claude/local/claude'], HOME)).toBe(AppChannel.NATIVE);
    expect(detectAppChannel(['/opt/homebrew/Caskroom/claude-code/1.0/claude'], HOME)).toBe(
      AppChannel.HOMEBREW_CASK,
    );
    expect(detectAppChannel(['C:\\Users\\jake\\AppData\\Local\\Microsoft\\WinGet\\claude.exe'], HOME)).toBe(
      AppChannel.WINGET,
    );
    expect(detectAppChannel(['/snap/bin/claude'], HOME)).toBe(AppChannel.SYSTEM);
  });

  // brew installs BOTH a node formula and a claude cask, and only the second is
  // an app channel. An npm package that merely lives under /opt/homebrew came
  // from npm, not from a cask.
  it('does not mistake npm-under-homebrew for a homebrew cask', () => {
    expect(detectAppChannel(['/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js'], HOME)).toBe(
      AppChannel.NONE,
    );
  });
});

describe('detectInstallCoordinate — the axes are independent', () => {
  // The combination a single enum could not express: brew provides the runtime,
  // npm owns the packages, and no app channel is involved.
  it('reports brew-node + npm-globals as exactly that', () => {
    const coord = detectInstallCoordinate(
      ['/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js'],
      HOME,
    );
    expect(coord).toEqual({
      runtime: RuntimeManager.HOMEBREW,
      library: LibraryManager.NPM,
      channel: AppChannel.NONE,
    });
  });

  it('reports volta-runtime + volta-store separately from volta-runtime + npm', () => {
    const inVoltaStore = detectInstallCoordinate(
      ['/Users/jake/.volta/tools/image/packages/@anthropic-ai/claude-code/bin/claude'],
      HOME,
    );
    expect(inVoltaStore.runtime).toBe(RuntimeManager.VOLTA);
    expect(inVoltaStore.library).toBe(LibraryManager.VOLTA);

    const inNpmGlobals = detectInstallCoordinate(
      ['/Users/jake/.volta/tools/image/node/24.7.0/lib/node_modules/@anthropic-ai/claude-code/cli.js'],
      HOME,
    );
    expect(inNpmGlobals.runtime).toBe(RuntimeManager.VOLTA);
    expect(inNpmGlobals.library).toBe(LibraryManager.NPM);
  });
});

describe('toPackageManager — the legacy single-value view', () => {
  // The wire format and the CLI-update UI still speak one enum; collapsing must
  // preserve the answers those already relied on.
  it('keeps the answers the flat detector gave', () => {
    const cases: Array<[string[], PackageManager]> = [
      [['/Users/jake/.volta/bin/claude', '/Users/jake/.volta/tools/image/packages/x/bin/claude'], PackageManager.VOLTA],
      [['/Users/jake/.nvm/versions/node/v22.14.0/lib/node_modules/x/cli.js'], PackageManager.NPM],
      [['/Users/jake/Library/pnpm/global/5/node_modules/x'], PackageManager.PNPM],
      [['/Users/jake/.config/yarn/global/node_modules/x'], PackageManager.YARN],
      [['/Users/jake/.local/share/claude/claude'], PackageManager.NATIVE],
      [['/opt/homebrew/Caskroom/claude-code/1.0/claude'], PackageManager.HOMEBREW],
      [['C:\\Users\\jake\\AppData\\Local\\Microsoft\\WinGet\\claude.exe'], PackageManager.WINGET],
      [['/usr/bin/claude'], PackageManager.UNKNOWN],
    ];
    for (const [paths, expected] of cases) {
      expect(toPackageManager(detectInstallCoordinate(paths, HOME)), paths.join()).toBe(expected);
    }
  });
});

describe('launcherFor', () => {
  const npmSibling = (p: string) => p.endsWith('/npm') || p.endsWith('\\npm.cmd');

  it('pins npm to the sibling of the running Node', () => {
    expect(
      launcherFor(LibraryManager.NPM, '/Users/jake/.nvm/versions/node/v22.14.0/bin/node', 'darwin', npmSibling),
    ).toBe('/Users/jake/.nvm/versions/node/v22.14.0/bin/npm');
  });

  it('builds the win32 sibling with backslashes whatever OS runs this', () => {
    const winExists = (p: string) => p === 'C:\\Program Files\\nodejs\\npm.cmd';
    expect(launcherFor(LibraryManager.NPM, 'C:\\Program Files\\nodejs\\node.exe', 'win32', winExists)).toBe(
      'C:\\Program Files\\nodejs\\npm.cmd',
    );
  });

  it('falls back to the bare name when there is no sibling', () => {
    expect(launcherFor(LibraryManager.NPM, '/nowhere/bin/node', 'darwin', () => false)).toBe('npm');
    expect(launcherFor(LibraryManager.NPM, 'C:\\nowhere\\node.exe', 'win32', () => false)).toBe('npm.cmd');
  });

  it('leaves the other stores to a PATH lookup', () => {
    for (const m of [LibraryManager.VOLTA, LibraryManager.PNPM, LibraryManager.YARN, LibraryManager.BUN]) {
      expect(launcherFor(m, '/Users/jake/.nvm/versions/node/v22.14.0/bin/node', 'darwin', npmSibling)).toBe(m);
    }
  });
});

describe('npmPrefixFor', () => {
  // Choosing the right npm binary is NOT enough: `npm_config_prefix` in the
  // environment overrides which global folder that npm acts on. Measured on a
  // machine that had it set — `npm uninstall -g` printed "up to date", exited 0
  // and removed nothing; the same command with --prefix removed the package.
  it('points at the global folder of the given Node', () => {
    expect(npmPrefixFor(LibraryManager.NPM, '/Users/jake/.nvm/versions/node/v22.14.0/bin/node', 'darwin')).toBe(
      '/Users/jake/.nvm/versions/node/v22.14.0',
    );
  });

  // win32 keeps node.exe directly in the prefix, with no bin/ level to strip.
  it('uses the directory itself on win32', () => {
    expect(npmPrefixFor(LibraryManager.NPM, 'C:\\Program Files\\nodejs\\node.exe', 'win32')).toBe(
      'C:\\Program Files\\nodejs',
    );
  });

  it('is null for stores that have no such flag', () => {
    for (const m of [LibraryManager.VOLTA, LibraryManager.PNPM, LibraryManager.YARN, LibraryManager.BUN]) {
      expect(npmPrefixFor(m, '/Users/jake/.nvm/versions/node/v22.14.0/bin/node', 'darwin')).toBeNull();
    }
  });
});
