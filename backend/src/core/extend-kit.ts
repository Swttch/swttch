import { createRequire } from 'node:module';
import { sep, dirname, join } from 'node:path';
import { realpath, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Command, ShellKind } from './command';
import { PackageManager } from '../shared';
import { EXTEND_KIT_PACKAGE, resolveLauncher } from './global-install-target';

/** The npm package this module loads. Also the name shown when it is missing. */
export { EXTEND_KIT_PACKAGE };
/** The executable the package provides, which is how volta knows it. */
const CCB_BINARY = 'ccb';

/**
 * Loads @swttch/extend-kit from the user's global npm install at runtime.
 *
 * It is deliberately NOT a dependency of this backend. Bundling it would put
 * credential-reading code inside the plugin, which is the exact thing that
 * forced these tools out into a separate package — a JetBrains plugin may not
 * handle credentials. Keeping it external means the plugin ships no such code
 * and the user installs it themselves, the same arrangement the usage panel
 * already uses for `ccb`.
 *
 * Everything runs through a login shell, because a GUI-launched backend
 * inherits a minimal PATH that usually does not include the npm global bin.
 * See {@link candidateRoots} for why one lookup is not enough.
 */

/** Shape we use from the kit. Kept minimal so the import stays untyped-safe. */
export interface SpeechToTextStream {
  sendAudio: (chunk: Uint8Array) => void;
  close: () => Promise<void>;
}

export interface SpeechToTextHandlers {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (message: string, info?: { fatal?: boolean }) => void;
  onOpen?: () => void;
}

export interface SpeechToTextOptions {
  language?: string;
  extraKeyterms?: string[];
  typedInterims?: boolean;
}

interface ExtendKitStt {
  openSpeechToTextStream: (
    handlers: SpeechToTextHandlers,
    options?: SpeechToTextOptions,
  ) => Promise<SpeechToTextStream>;
  isSpeechToTextAvailable: () => Promise<boolean>;
}

/** Thrown when the kit is not installed, so callers can prompt for install. */
export class ExtendKitMissingError extends Error {
  constructor() {
    super(`${EXTEND_KIT_PACKAGE} is not installed`);
    this.name = 'ExtendKitMissingError';
  }
}

let cachedRoots: string[] | null = null;
let cachedStt: ExtendKitStt | null = null;

/** Last non-empty line of shell output — rc files print noise before it. */
function lastLine(stdout: string): string | null {
  return (
    stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .pop() ?? null
  );
}

/**
 * Places the kit might be installed, best candidate first.
 *
 * "Where a global npm package lives" has no single answer: volta, pnpm and yarn
 * each keep their own store, none of which is any Node's global folder.
 *
 *   volta  ~/.volta/tools/image/packages/<name>/lib/node_modules
 *   pnpm   ~/Library/pnpm/global/<n>/node_modules
 *   yarn   ~/.config/yarn/global/node_modules
 *   npm    <the active Node's prefix>/lib/node_modules
 *
 * So each manager is asked where it puts things, rather than guessing from a
 * path. The guesses were tried first and each failed on a real machine: `npm
 * root -g` named a different Node's folder than the one running this backend
 * (`/opt/homebrew` while the package sat under `~/.volta`), and following the
 * `ccb` binary hit volta's single shared shim, which is inside no package at
 * all. Both reported an installed, working kit as missing.
 *
 * Every manager is asked, not just the one that would install today: the kit may
 * have been put there by hand, or before this backend had an opinion. A manager
 * that is not installed simply makes its command fail.
 */
async function candidateRoots(): Promise<string[]> {
  if (cachedRoots) return cachedRoots;

  const roots: string[] = [];

  // 1. Ask volta where it put the package.
  //
  // volta does not install into any Node's global folder: each package gets its
  // own directory under ~/.volta/tools/image/packages/<name>/lib/node_modules,
  // and only the bin is linked out. So a volta install is invisible to every
  // other lookup here — which is exactly what happened after we started
  // installing through volta: the install succeeded and the version on screen
  // never moved.
  //
  // `volta which` resolves to the real executable rather than the shared shim
  // that `which` returns, and the package root is two levels above its bin.
  try {
    const { stdout } = await new Command('volta', ['which', CCB_BINARY], {
      timeout: 15000,
      shell: ShellKind.LoginInteractive,
    }).exec();
    const binPath = lastLine(stdout);
    if (binPath) {
      // …/packages/@swttch/extend-kit/bin/ccb → …/packages/@swttch/extend-kit
      const pkgRoot = dirname(dirname(binPath));
      const root = join(pkgRoot, 'lib', 'node_modules');
      if (!roots.includes(root)) roots.push(root);
    }
  } catch {
    // No volta on this machine, or it does not know the command.
  }

  // 2. Ask pnpm and yarn, which keep their own global stores.
  //
  // Neither installs into a Node's global folder either: pnpm answers
  // ~/Library/pnpm/global/<n>/node_modules and yarn ~/.config/yarn/global. A
  // machine where the installer chose one of them would otherwise hit exactly
  // the volta problem — installed, working, and reported missing.
  //
  // Both are asked regardless of which one the installer would pick, since the
  // kit may predate this backend's involvement, and an absent command simply
  // rejects.
  const stores: Array<{ command: string; args: string[]; suffix: string | null }> = [
    { command: 'pnpm', args: ['root', '-g'], suffix: null },
    // `yarn global dir` names the folder ABOVE node_modules, unlike pnpm.
    { command: 'yarn', args: ['global', 'dir'], suffix: 'node_modules' },
  ];
  for (const { command, args, suffix } of stores) {
    try {
      const { stdout } = await new Command(command, args, {
        timeout: 15000,
        shell: ShellKind.LoginInteractive,
      }).exec();
      const dir = lastLine(stdout);
      if (dir) {
        const root = suffix ? join(dir, suffix) : dir;
        if (!roots.includes(root)) roots.push(root);
      }
    } catch {
      // Not installed on this machine.
    }
  }

  // 3. The global folder belonging to the Node running this backend.
  //
  // No command to run and nothing to resolve: `npm i -g` installs into the
  // global folder of whichever Node is active, and that is the Node executing
  // this code. Under volta both other lookups miss it — `npm root -g` through a
  // login shell answered /opt/homebrew (a different Node entirely), and the
  // `ccb` binary resolves to volta's shared shim rather than to a package
  // directory. So the kit sat here, installed, while both answers said no.
  //
  // <prefix>/bin/node → <prefix>/lib/node_modules, which is the layout on
  // macOS/Linux. On Windows node lives at <prefix>/node.exe with modules in
  // <prefix>/node_modules, so both shapes are offered and the miss costs a
  // failed file read.
  try {
    const binDir = dirname(process.execPath);
    roots.push(join(dirname(binDir), 'lib', 'node_modules'));
    roots.push(join(binDir, 'node_modules'));
  } catch {
    // execPath is always set in practice; a failure here just means we rely on
    // the lookups below.
  }

  // 3b. Windows' real npm global prefix.
  //
  // Neither shape above is where `npm i -g` actually writes on Windows. With
  // node at C:\Program Files\nodejs\node.exe they resolve to
  // `C:\Program Files\lib\node_modules` (a path that does not exist at all) and
  // `C:\Program Files\nodejs\node_modules` (node's own bundled modules, not the
  // global folder). npm's default prefix on Windows is %APPDATA%\npm, so the
  // packages live in %APPDATA%\npm\node_modules — the location `candidateBinDirs`
  // already knows about for finding the `claude` launcher.
  //
  // Without this entry a Windows install can only be found by lookups 4 and 5,
  // both of which spawn a process and can fail on a GUI-launched backend. That
  // is the same "installed, working, reported missing" shape as #298.
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) {
      const root = join(appData, 'npm', 'node_modules');
      if (!roots.includes(root)) roots.push(root);
    }
  }

  // 4. Follow the ccb binary — survives version managers.
  //
  // `which` gives the shim, not the file it points at, so we resolve the link
  // ourselves rather than passing a quoted `node -e` script through the shell:
  // this project's rule is to avoid shell tokenisation, and a script full of
  // quotes is exactly what breaks across cmd / PowerShell / bash.
  try {
    const ccbPath = await new Command('ccb').which();
    if (ccbPath) {
      const real = await realpath(ccbPath);
      // …/node_modules/@swttch/extend-kit/dist/cli/index.js → …/node_modules
      const marker = `${sep}node_modules${sep}`;
      const at = real.lastIndexOf(marker);
      const root = at > 0 ? real.slice(0, at + marker.length - 1) : null;
      if (root && !roots.includes(root)) roots.push(root);
    }
  } catch {
    // ccb not installed, or the link could not be read — try npm next.
  }

  // 5. Whatever npm considers global, for installs that did not link a bin.
  //
  // Asked of the npm sitting NEXT TO the running Node first, and only then of
  // whichever npm the PATH surfaces. The two are not always the same program,
  // and the sibling is the one whose global folder this Node actually resolves
  // from — which is the folder the installer now writes to. Asking only PATH's
  // npm is how an install could land somewhere real, report success, and still
  // be invisible here (#298).
  // The absolute sibling is asked with ShellKind.Direct, NOT LoginInteractive:
  // the login-shell form builds its command line by joining argv with spaces
  // (`sh -l -i -c "<bin> <args>"`), so an absolute path containing a space —
  // fnm's default on macOS is under `~/Library/Application Support/fnm/...` —
  // would be torn apart at that space. Direct passes argv without a shell, which
  // is this project's shell-tokenisation rule. The bare name still uses the
  // login shell, since a bare `npm` needs the rc-file PATH to resolve at all.
  const npmLookups: Array<{ bin: string; shell: ShellKind }> = [];
  const sibling = resolveLauncher(PackageManager.NPM, process.execPath);
  const bareNpm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (sibling !== bareNpm) npmLookups.push({ bin: sibling, shell: ShellKind.Direct });
  npmLookups.push({ bin: bareNpm, shell: ShellKind.LoginInteractive });

  for (const { bin, shell } of npmLookups) {
    try {
      const { stdout } = await new Command(bin, ['root', '-g'], {
        timeout: 15000,
        shell,
      }).exec();
      const root = lastLine(stdout);
      if (root && !roots.includes(root)) roots.push(root);
    } catch {
      // Neither path worked; the caller reports it as missing.
    }
  }

  cachedRoots = roots;
  return roots;
}

/**
 * Load the kit's speech-to-text module.
 *
 * @throws ExtendKitMissingError when the package is not installed globally.
 */
export async function loadSpeechToText(): Promise<ExtendKitStt> {
  if (cachedStt) return cachedStt;

  for (const root of await candidateRoots()) {
    try {
      // createRequire gives us node's own resolution rooted at that folder, so
      // subpath exports and the package's own dependencies (ws) resolve the way
      // they would for any consumer.
      const entry = createRequire(`${root}${sep}`).resolve(`${EXTEND_KIT_PACKAGE}/stt`);
      const mod = (await import(pathToFileURL(entry).href)) as ExtendKitStt;
      if (typeof mod.openSpeechToTextStream === 'function') {
        cachedStt = mod;
        return mod;
      }
    } catch {
      // Not here; try the next candidate.
    }
  }

  throw new ExtendKitMissingError();
}

/**
 * The version installed on this machine, or null when the kit is not installed.
 *
 * Read from the package's own package.json through the same root resolution the
 * loader uses, rather than by running `ccb --version`: a version manager can put
 * the binary somewhere npm does not report, and this way both answers come from
 * the same place — so the version shown can never describe a different install
 * than the one dictation actually loads.
 */
export async function getExtendKitVersion(): Promise<string | null> {
  for (const root of await candidateRoots()) {
    try {
      // Read the manifest as a plain file rather than resolving it as a subpath:
      // the package's `exports` map does not list "./package.json" (few do), so
      // asking node to resolve it throws ERR_PACKAGE_PATH_NOT_EXPORTED and an
      // installed kit reports as missing.
      const manifest = `${root}${sep}${EXTEND_KIT_PACKAGE.split('/').join(sep)}${sep}package.json`;
      const { version } = JSON.parse(await readFile(manifest, 'utf8')) as { version?: string };
      if (typeof version === 'string' && version) return version;
    } catch {
      // Not under this root, or an unreadable manifest — try the next one.
    }
  }
  return null;
}

/** Forget the cached resolution so a fresh install is picked up without a restart. */
export function resetExtendKitCache(): void {
  cachedRoots = null;
  cachedStt = null;
}
