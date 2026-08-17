import { describe, it, expect } from 'vitest';
import {
  resolveInstallCoordinate,
  installManagerFor,
  buildInstallSpec,
  buildUninstallSpec,
  buildUninstallSpecsForAllStores,
  packageManagerFor,
} from '../global-install-target';
import { RuntimeManager, LibraryManager, AppChannel, PackageManager } from '../../shared';

const HOME = '/Users/jake';
/** Pretend every `<bin>/npm` exists, exercising the sibling-pinning branch. */
const npmSiblingExists = (p: string) => p.endsWith('/npm') || p.endsWith('\\npm.cmd');
/** Pretend nothing exists, so the bare-name fallback shows. */
const nothingExists = () => false;

const VOLTA_CLAUDE = [
  '/Users/jake/.volta/bin/claude',
  '/Users/jake/.volta/tools/image/packages/@anthropic-ai/claude-code/bin/claude',
];

describe('resolveInstallCoordinate', () => {
  // The bug behind #298: the installer asked only `process.execPath` while the
  // CLI updater asked the `claude` binary, so on a machine where those differ
  // the two features disagreed and the install went somewhere the loader never
  // reads.
  it('takes the library store from the `claude` the user runs in a terminal', () => {
    const coord = resolveInstallCoordinate(VOLTA_CLAUDE, '/opt/homebrew/bin/node', HOME);
    expect(coord.library).toBe(LibraryManager.VOLTA);
  });

  // The runtime is a property of the Node we are running on; a native-installer
  // claude says nothing about Node, so it must not blank this axis out.
  it('takes the runtime from the Node running the backend', () => {
    const coord = resolveInstallCoordinate(
      ['/Users/jake/.local/share/claude/claude'],
      '/Users/jake/.volta/tools/image/node/24.7.0/bin/node',
      HOME,
    );
    expect(coord.runtime).toBe(RuntimeManager.VOLTA);
    expect(coord.channel).toBe(AppChannel.NATIVE);
  });

  it('falls back to the running Node when `claude` is not on PATH', () => {
    const coord = resolveInstallCoordinate(
      [null, null],
      '/Users/jake/.volta/tools/image/node/24.7.0/bin/node',
      HOME,
    );
    expect(coord.runtime).toBe(RuntimeManager.VOLTA);
    expect(coord.library).toBe(LibraryManager.VOLTA);
  });

  it('resolves a version-managed Node to npm globals', () => {
    const coord = resolveInstallCoordinate(
      [null],
      '/Users/jake/.nvm/versions/node/v22.14.0/bin/node',
      HOME,
    );
    expect(coord.runtime).toBe(RuntimeManager.NVM);
    expect(coord.library).toBe(LibraryManager.NPM);
  });
});

describe('installManagerFor', () => {
  // App channels ship Claude Code itself and cannot install an npm package, so
  // the library axis answers this — falling back to npm.
  it('falls back to npm when no store could be named', () => {
    expect(
      installManagerFor({
        runtime: RuntimeManager.SYSTEM,
        library: LibraryManager.UNKNOWN,
        channel: AppChannel.NATIVE,
      }),
    ).toBe(LibraryManager.NPM);
  });

  it('keeps a named store', () => {
    for (const library of [LibraryManager.VOLTA, LibraryManager.PNPM, LibraryManager.YARN, LibraryManager.BUN]) {
      expect(
        installManagerFor({ runtime: RuntimeManager.UNKNOWN, library, channel: AppChannel.NONE }),
      ).toBe(library);
    }
  });
});

describe('buildInstallSpec', () => {
  const coordFor = (library: LibraryManager) => ({
    runtime: RuntimeManager.UNKNOWN,
    library,
    channel: AppChannel.NONE,
  });

  it('uses each store’s own global-install verb', () => {
    const node = '/nowhere/bin/node';
    expect(buildInstallSpec(coordFor(LibraryManager.VOLTA), node, undefined, 'darwin', nothingExists)).toEqual({
      command: 'volta',
      args: ['install', '@swttch/extend-kit'],
    });
    expect(buildInstallSpec(coordFor(LibraryManager.PNPM), node, undefined, 'darwin', nothingExists)).toEqual({
      command: 'pnpm',
      args: ['add', '-g', '@swttch/extend-kit'],
    });
    expect(buildInstallSpec(coordFor(LibraryManager.YARN), node, undefined, 'darwin', nothingExists)).toEqual({
      command: 'yarn',
      args: ['global', 'add', '@swttch/extend-kit'],
    });
    // npm carries --prefix so an inherited `npm_config_prefix` cannot redirect
    // it; the other stores have no such flag.
    expect(buildInstallSpec(coordFor(LibraryManager.NPM), node, undefined, 'darwin', nothingExists)).toEqual({
      command: 'npm',
      args: ['install', '-g', '--prefix', '/nowhere', '@swttch/extend-kit'],
    });
  });

  // A GUI backend's PATH is the IDE's, not the user's, so a bare `npm` can
  // belong to a different Node — and installing with it writes to a global
  // folder this backend never reads. That is #298 in one line.
  it('installs with the backend Node’s own npm when it has one', () => {
    expect(
      buildInstallSpec(coordFor(LibraryManager.NPM), '/opt/homebrew/bin/node', undefined, 'darwin', npmSiblingExists),
    ).toEqual({
      command: '/opt/homebrew/bin/npm',
      args: ['install', '-g', '--prefix', '/opt/homebrew', '@swttch/extend-kit'],
    });
  });
});

describe('buildUninstallSpec', () => {
  // Removing with the wrong tool is not a loud failure — it succeeds against a
  // store the package was never in, so the user is told it was removed while it
  // is still installed.
  it('matches the install manager', () => {
    const node = '/nowhere/bin/node';
    expect(
      buildUninstallSpec(
        { runtime: RuntimeManager.VOLTA, library: LibraryManager.VOLTA, channel: AppChannel.NONE },
        'claude-code-battery',
        node,
        'darwin',
        nothingExists,
      ),
    ).toEqual({ command: 'volta', args: ['uninstall', 'claude-code-battery'] });
  });
});

describe('buildUninstallSpecsForAllStores', () => {
  // THE reason this exists. A machine can hold the same package twice: volta's
  // own store held 0.4.0 while `npm i -g` under volta's Node held 0.3.0, and
  // `volta uninstall` cleared only the first. Deleting has to sweep every store.
  it('covers every store, with the coordinate’s own first', () => {
    const specs = buildUninstallSpecsForAllStores(
      { runtime: RuntimeManager.VOLTA, library: LibraryManager.VOLTA, channel: AppChannel.NONE },
      '@swttch/extend-kit',
      '/nowhere/bin/node',
      'darwin',
      nothingExists,
    );
    const argv = specs.map((s) => [s.command, ...s.args].join(' '));

    expect(argv[0]).toBe('volta uninstall @swttch/extend-kit');
    expect(argv).toContain('npm uninstall -g --prefix /nowhere @swttch/extend-kit');
    expect(argv).toContain('pnpm remove -g @swttch/extend-kit');
    expect(argv).toContain('yarn global remove @swttch/extend-kit');
    expect(argv).toContain('bun remove -g @swttch/extend-kit');
    // No store is asked twice.
    expect(new Set(argv).size).toBe(argv.length);
  });

  it('puts npm first when npm is the coordinate’s store', () => {
    const specs = buildUninstallSpecsForAllStores(
      { runtime: RuntimeManager.HOMEBREW, library: LibraryManager.NPM, channel: AppChannel.NONE },
      '@swttch/extend-kit',
      '/nowhere/bin/node',
      'darwin',
      nothingExists,
    );
    expect([specs[0].command, ...specs[0].args].join(' ')).toBe('npm uninstall -g --prefix /nowhere @swttch/extend-kit');
  });
});

describe('packageManagerFor — the legacy view stays stable', () => {
  it('maps a coordinate back to the single enum the wire format uses', () => {
    expect(
      packageManagerFor({
        runtime: RuntimeManager.VOLTA,
        library: LibraryManager.VOLTA,
        channel: AppChannel.NONE,
      }),
    ).toBe(PackageManager.VOLTA);
    expect(
      packageManagerFor({
        runtime: RuntimeManager.SYSTEM,
        library: LibraryManager.UNKNOWN,
        channel: AppChannel.NATIVE,
      }),
    ).toBe(PackageManager.NATIVE);
  });
});
