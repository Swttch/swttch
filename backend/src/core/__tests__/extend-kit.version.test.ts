import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The kit's install root is discovered by running commands (`which ccb`,
 * `npm root -g`), so the lookup is driven through a fake Command that reports a
 * temp directory laid out like a real global node_modules.
 */
let ccbPath: string | null = null;
let npmRoot = '';
/** What `volta which ccb` answers; empty means volta does not know it. */
let voltaWhich = '';
/** What `pnpm root -g` and `yarn global dir` answer; empty means not installed. */
let pnpmRoot = '';
let yarnGlobalDir = '';

vi.mock('../command', () => ({
  ShellKind: { LoginInteractive: 'login-interactive' },
  Command: class {
    constructor(
      private readonly command: string,
      private readonly args: string[] = [],
    ) {}
    which() {
      return Promise.resolve(ccbPath);
    }
    exec() {
      // Each manager is asked where it keeps global packages; an absent one
      // rejects, exactly as a missing command does.
      // On Windows the lookup asks for `npm.cmd`, so the name is normalised —
      // otherwise npmRoot answers nothing there and the fixture is ignored.
      const answer = {
        volta: voltaWhich,
        pnpm: pnpmRoot,
        yarn: yarnGlobalDir,
        npm: npmRoot,
      }[this.command.replace(/\.cmd$/, '')];
      void this.args;
      if (!answer) return Promise.reject(new Error(`${this.command}: command not found`));
      return Promise.resolve({ stdout: answer, stderr: '' });
    }
  },
}));

import { getExtendKitVersion, resetExtendKitCache } from '../extend-kit';

describe('getExtendKitVersion', () => {
  let dir: string;
  let execPathSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kit-version-'));
    ccbPath = null;
    npmRoot = '';
    voltaWhich = '';
    pnpmRoot = '';
    yarnGlobalDir = '';
    // The lookup now starts from the running Node's own global folder, which on
    // a developer machine is a real install — every test would find that
    // instead of its fixture. Point it at an empty temp prefix so each test
    // sees only what it sets up.
    execPathSpy = vi.spyOn(process, 'execPath', 'get');
    execPathSpy.mockReturnValue(join(dir, 'no-node', 'bin', 'node'));
    // On Windows the lookup also offers %APPDATA%\npm\node_modules, npm's real
    // global prefix there. Left alone it is a developer's actual install, which
    // every test would find instead of its fixture — the same reason execPath
    // is pointed at an empty prefix above.
    vi.stubEnv('APPDATA', join(dir, 'no-appdata'));
    resetExtendKitCache();
  });

  afterEach(async () => {
    execPathSpy.mockRestore();
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
    resetExtendKitCache();
  });

  /** Lay out `<dir>/node_modules/@swttch/extend-kit` with the given manifest. */
  async function installKit(manifest: Record<string, unknown>) {
    const pkgDir = join(dir, 'node_modules', '@swttch', 'extend-kit');
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify(manifest));
    npmRoot = join(dir, 'node_modules');
    return pkgDir;
  }

  it('reads the installed version', async () => {
    await installKit({ name: '@swttch/extend-kit', version: '0.4.0' });
    expect(await getExtendKitVersion()).toBe('0.4.0');
  });

  it('reads it even when the package does not export its manifest', async () => {
    // Real packages rarely list "./package.json" in `exports`, and the kit does
    // not. Resolving it as a subpath throws ERR_PACKAGE_PATH_NOT_EXPORTED, which
    // reported an installed kit as missing and left the settings section locked
    // right after installing it.
    await installKit({
      name: '@swttch/extend-kit',
      version: '0.4.0',
      exports: { './stt': './dist/stt/index.js' },
    });
    expect(await getExtendKitVersion()).toBe('0.4.0');
  });

  it('answers null when the kit is not installed', async () => {
    npmRoot = join(dir, 'node_modules');
    await mkdir(npmRoot, { recursive: true });
    expect(await getExtendKitVersion()).toBeNull();
  });

  it('answers null rather than throwing on an unreadable manifest', async () => {
    const pkgDir = join(dir, 'node_modules', '@swttch', 'extend-kit');
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, 'package.json'), 'not json');
    npmRoot = join(dir, 'node_modules');
    expect(await getExtendKitVersion()).toBeNull();
  });

  it('finds a volta install, which lives in none of the global folders', async () => {
    // volta gives each package its own directory and only links the bin out, so
    // a volta install is invisible to every other lookup. After the installer
    // started using volta, this was the gap that left the version on screen
    // stuck at the old number while the new one was installed and working.
    const pkgRoot = join(dir, 'volta', 'tools', 'image', 'packages', '@swttch', 'extend-kit');
    const inner = join(pkgRoot, 'lib', 'node_modules', '@swttch', 'extend-kit');
    await mkdir(inner, { recursive: true });
    await writeFile(join(inner, 'package.json'), JSON.stringify({ version: '0.4.0' }));
    voltaWhich = join(pkgRoot, 'bin', 'ccb');

    expect(await getExtendKitVersion()).toBe('0.4.0');
  });

  it('prefers the volta install over a stale copy elsewhere', async () => {
    // Both can exist at once: an older `npm i -g` copy in the Node's global
    // folder, and the current one volta manages. Reporting the stale one is
    // what made a successful update look like nothing happened.
    const prefix = join(dir, 'nodeprefix');
    const stale = join(prefix, 'lib', 'node_modules', '@swttch', 'extend-kit');
    await mkdir(stale, { recursive: true });
    await writeFile(join(stale, 'package.json'), JSON.stringify({ version: '0.3.0' }));
    execPathSpy.mockReturnValue(join(prefix, 'bin', 'node'));

    const pkgRoot = join(dir, 'volta', 'packages', '@swttch', 'extend-kit');
    const inner = join(pkgRoot, 'lib', 'node_modules', '@swttch', 'extend-kit');
    await mkdir(inner, { recursive: true });
    await writeFile(join(inner, 'package.json'), JSON.stringify({ version: '0.4.0' }));
    voltaWhich = join(pkgRoot, 'bin', 'ccb');

    expect(await getExtendKitVersion()).toBe('0.4.0');
  });

  it('finds a pnpm install in pnpm’s own global store', async () => {
    // pnpm answers with the node_modules directly (~/Library/pnpm/global/5/…),
    // which is nowhere near any Node's global folder.
    const store = join(dir, 'pnpm', 'global', '5', 'node_modules');
    const inner = join(store, '@swttch', 'extend-kit');
    await mkdir(inner, { recursive: true });
    await writeFile(join(inner, 'package.json'), JSON.stringify({ version: '0.4.0' }));
    pnpmRoot = store;

    expect(await getExtendKitVersion()).toBe('0.4.0');
  });

  it('finds a yarn install, whose node_modules sits under the reported dir', async () => {
    // `yarn global dir` names the folder ABOVE node_modules, unlike pnpm — so
    // the two cannot be treated the same way.
    const globalDir = join(dir, 'yarn', 'global');
    const inner = join(globalDir, 'node_modules', '@swttch', 'extend-kit');
    await mkdir(inner, { recursive: true });
    await writeFile(join(inner, 'package.json'), JSON.stringify({ version: '0.4.0' }));
    yarnGlobalDir = globalDir;

    expect(await getExtendKitVersion()).toBe('0.4.0');
  });

  it("finds the kit in the running Node's own global folder", async () => {
    // The volta case, which had both other lookups answering "not installed"
    // for a kit that was sitting right there:
    //   - `ccb` resolves to volta's shared shim, so there is no package
    //     directory to walk up from (and volta may still own that name from the
    //     kit's predecessor).
    //   - `npm root -g` through a login shell names a different Node's folder.
    // `npm i -g` installed into the global folder of the Node running this
    // backend, so that is where it is.
    const prefix = join(dir, 'nodeprefix');
    const globalDir = join(prefix, 'lib', 'node_modules', '@swttch', 'extend-kit');
    await mkdir(globalDir, { recursive: true });
    await writeFile(join(globalDir, 'package.json'), JSON.stringify({ version: '0.3.0' }));

    const shim = join(dir, 'volta', 'bin', 'volta-shim');
    await mkdir(join(dir, 'volta', 'bin'), { recursive: true });
    await writeFile(shim, '');
    ccbPath = shim;
    npmRoot = join(dir, 'homebrew', 'lib', 'node_modules');

    execPathSpy.mockReturnValue(join(prefix, 'bin', 'node'));
    expect(await getExtendKitVersion()).toBe('0.3.0');
  });

  it('finds the kit through the ccb binary when npm points elsewhere', async () => {
    // Under a version manager, `npm root -g` can name a folder the package is
    // not in; following the binary is what saves the lookup.
    const pkgDir = await installKit({ name: '@swttch/extend-kit', version: '0.9.9' });
    ccbPath = join(pkgDir, 'dist', 'cli', 'index.js');
    await mkdir(join(pkgDir, 'dist', 'cli'), { recursive: true });
    await writeFile(ccbPath, '');
    npmRoot = join(dir, 'elsewhere');

    expect(await getExtendKitVersion()).toBe('0.9.9');
  });
});
