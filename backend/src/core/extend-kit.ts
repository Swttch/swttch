import { sep, dirname, join } from 'node:path';
import { realpath, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Command, ShellKind } from './command';
import { Claude } from './claude';
import { LibraryManager } from '../shared';
import { EXTEND_KIT_PACKAGE } from './global-install-target';
import { launcherFor, npmPrefixFor } from './install-coordinate';

/** The npm package this module loads. Also the name shown when it is missing. */
export { EXTEND_KIT_PACKAGE };
/** The executable the package provides, which is how volta knows it. */
const CCB_BINARY = 'ccb';

/**
 * Locates the user's global @swttch/extend-kit install and RUNS it as `ccb`.
 *
 * The kit is deliberately not a dependency of this backend, and it is never
 * imported either — not statically, not with a dynamic `import()`. Both would
 * put credential-reading code inside the plugin's own process, which is the
 * exact thing that forced these tools out into a separate package: a JetBrains
 * plugin may not handle credentials, and "the user installed it separately" does
 * not change where the code RUNS. Spawning keeps the token on the other side of
 * a process boundary — we write audio in and read text out.
 *
 * So the only thing this module resolves is a path to execute. Everything else
 * goes over stdin/stdout, the same contract a terminal user gets.
 *
 * Lookups run through a login shell, because a GUI-launched backend inherits a
 * minimal PATH that usually does not include the npm global bin. See
 * {@link candidateRoots} for why one lookup is not enough.
 */

/** Shape the spawned stream presents to callers. Mirrors the kit's own type. */
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

/** Thrown when the kit is not installed, so callers can prompt for install. */
export class ExtendKitMissingError extends Error {
  constructor() {
    super(`${EXTEND_KIT_PACKAGE} is not installed`);
    this.name = 'ExtendKitMissingError';
  }
}

/**
 * Thrown when the kit is installed but too old for what the caller needs.
 *
 * Its own error rather than a missing kit, because the fix differs: this one is
 * "update the kit", and telling the user to install something they already have
 * is the kind of wrong-problem message that cost us #355. There is no fallback
 * to offer here — the old path was an in-process import, which is the thing
 * being removed.
 */
export class ExtendKitTooOldError extends Error {
  constructor(public readonly version: string | null, missing: string) {
    super(`${EXTEND_KIT_PACKAGE} ${version ?? ''} does not support "${missing}"`.trim());
    this.name = 'ExtendKitTooOldError';
  }
}

/** Capability the kit reports once `ccb stt` exists. */
const STT_CAPABILITY = 'stt.stream';

/**
 * Capability the kit reports once it reads Claude's settings files itself.
 *
 * Required because this backend stopped copying that `env` block into the child's
 * environment once the kit could read it. A kit without this reads neither — so a proxy or a
 * CLAUDE_CODE_OAUTH_TOKEN configured only in settings.json reaches nothing, and the symptom
 * is a 401 or a timeout with nothing pointing at the cause. `stt.stream` cannot stand in for
 * it: 0.7.0 advertises that one too, and 0.7.0 is exactly the version this rules out.
 */
const SETTINGS_ENV_CAPABILITY = 'settings.env';

/**
 * How long to wait for `ccb stt` to exit after its stdin closes.
 *
 * The child is deliberately given a moment to flush the speaker's last words,
 * so this is not a failure budget — it is the point past which we stop waiting
 * and kill it so the stop button cannot hang.
 */
const CLOSE_TIMEOUT_MS = 5_000;

let cachedRoots: string[] | null = null;
let cachedEntry: string | null = null;
/**
 * What the installed kit says it supports, cached until something changes the install.
 *
 * Asking costs a process spawn — measured at about 120ms — and the usage panel asks on every
 * refresh, which used to mean two `ccb` spawns per reading where one would do. The answer
 * cannot change under a running install, and the one thing that does change it (installing or
 * updating the kit) already goes through {@link resetExtendKitCache}.
 */
let cachedCapabilities: string[] | null = null;

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
  // `--prefix` pins the sibling lookup to THIS Node's global folder. Without it
  // an inherited `npm_config_prefix` silently redirects `npm root -g` to some
  // other prefix — measured: it answered another project's `backend/lib/
  // node_modules` — so the loader would look for the kit in a folder nothing
  // installs into.
  const npmLookups: Array<{ bin: string; args: string[]; shell: ShellKind }> = [];
  const sibling = launcherFor(LibraryManager.NPM, process.execPath, process.platform, existsSync);
  const prefix = npmPrefixFor(LibraryManager.NPM, process.execPath);
  const bareNpm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (sibling !== bareNpm) {
    npmLookups.push({
      bin: sibling,
      args: prefix ? ['root', '-g', '--prefix', prefix] : ['root', '-g'],
      shell: ShellKind.Direct,
    });
  }
  npmLookups.push({ bin: bareNpm, args: ['root', '-g'], shell: ShellKind.LoginInteractive });

  for (const { bin, args, shell } of npmLookups) {
    try {
      const { stdout } = await new Command(bin, args, {
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
 * Absolute path of the kit's CLI script, to be run under THIS Node.
 *
 * The path comes from the installed package's own `bin.ccb` rather than a
 * hardcoded `dist/cli/index.js`, so the kit can move its entry point without
 * silently breaking dictation on machines that already updated.
 *
 * @throws ExtendKitMissingError when the package is not installed globally.
 */
async function resolveCcbEntry(): Promise<string> {
  if (cachedEntry) return cachedEntry;

  const install = await getExtendKitInstallation();
  if (!install) throw new ExtendKitMissingError();

  const packageDir = join(install.root, ...EXTEND_KIT_PACKAGE.split('/'));
  let relative: string | undefined;
  try {
    const manifest = JSON.parse(
      await readFile(join(packageDir, 'package.json'), 'utf8'),
    ) as { bin?: string | Record<string, string> };
    relative = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[CCB_BINARY];
  } catch {
    throw new ExtendKitMissingError();
  }
  if (!relative) throw new ExtendKitMissingError();

  const entry = join(packageDir, relative);
  if (!existsSync(entry)) throw new ExtendKitMissingError();

  cachedEntry = entry;
  return entry;
}

/**
 * Run the kit's CLI under this Node rather than through the `ccb` shim.
 *
 * `process.execPath` is the Node already running this backend, so no PATH
 * lookup can fail and no shell is involved — which matters because the audio
 * stream writes raw bytes into stdin, and a shell in between is one more thing
 * that can transform them.
 */
function ccbCommand(entry: string, args: string[], timeout?: number, cwd?: string): Command {
  // `cwd` is how the child learns which project it is answering for. It reads Claude's
  // settings files itself, and the project half of those lives under the working directory,
  // so without this a project's proxy or CLAUDE_CODE_OAUTH_TOKEN is simply not seen.
  return new Command(process.execPath, [entry, ...args], { ...(timeout ? { timeout } : {}), cwd });
}

/**
 * Whether the installed kit is new enough to stream dictation.
 *
 * Checked through `--capabilities` rather than by comparing version numbers: the
 * capability list is the kit's own statement about what it supports, and a
 * version comparison here would have to be updated in lockstep with a package
 * that ships on its own schedule.
 *
 * @throws ExtendKitTooOldError when the kit predates `ccb stt`.
 */
async function readCapabilities(entry: string, workingDir?: string): Promise<string[]> {
  if (cachedCapabilities) return cachedCapabilities;

  let capabilities: string[] = [];
  try {
    const { stdout } = await ccbCommand(entry, ['--capabilities'], 15_000, workingDir).exec();
    const parsed = JSON.parse(lastLine(stdout) ?? '{}') as { capabilities?: string[] };
    capabilities = parsed.capabilities ?? [];
  } catch {
    // A kit old enough to not know --capabilities fails here, which is the same
    // answer as a kit that knows the flag but not the capability being asked about.
    capabilities = [];
  }

  cachedCapabilities = capabilities;
  return capabilities;
}

async function assertSttCapable(entry: string): Promise<void> {
  const capabilities = await readCapabilities(entry);

  for (const required of [STT_CAPABILITY, SETTINGS_ENV_CAPABILITY]) {
    if (!capabilities.includes(required)) {
      throw new ExtendKitTooOldError(await getExtendKitVersion(), required);
    }
  }
}

/**
 * Whether the installed kit reads Claude's settings files itself.
 *
 * Separate from {@link assertSttCapable} because the usage panel needs the same guarantee and
 * has nothing to do with dictation. Answers rather than throws: the usage handler turns a "no"
 * into its own message, and a failure to ask at all should not take the panel down.
 */
export async function hasSettingsEnvCapability(workingDir?: string): Promise<boolean> {
  try {
    const entry = await resolveCcbEntry();
    return (await readCapabilities(entry, workingDir)).includes(SETTINGS_ENV_CAPABILITY);
  } catch {
    // Not installed. Either way it does not have the capability.
    return false;
  }
}

/**
 * Open a dictation stream by SPAWNING `ccb stt`.
 *
 * Audio goes in on stdin as raw PCM; transcripts come back on stdout as one
 * JSON object per line. The credential that authorizes the transcription is
 * read inside that child process and never crosses back — this process only
 * ever holds audio and text.
 *
 * @throws ExtendKitMissingError when the package is not installed globally.
 * @throws ExtendKitTooOldError when the installed kit has no `stt` command.
 */
export async function spawnSpeechToText(
  handlers: SpeechToTextHandlers,
  options: SpeechToTextOptions = {},
  workingDir?: string,
): Promise<SpeechToTextStream> {
  const entry = await resolveCcbEntry();
  await assertSttCapable(entry);

  // Settle the Claude data directory before the child exists to inherit it. Dictation was
  // the one feature that never did this, so the login it authenticated with was whichever
  // project had most recently loaded — in a second project, somebody else's.
  await Claude.applyConfigDir(workingDir);

  const args = ['stt'];
  if (options.language) args.push(`--language=${options.language}`);
  if (options.extraKeyterms?.length) args.push(`--keyterms=${options.extraKeyterms.join(',')}`);
  if (options.typedInterims) args.push('--interims');

  const child = ccbCommand(entry, args, undefined, workingDir).spawn({
    stdio: ['pipe', 'pipe', 'pipe'],
    // Never a shell: stdin carries raw audio bytes.
    shell: false,
  });

  let closed = false;

  // stdout arrives in chunks that do not respect line boundaries, so a partial
  // line is held until its newline shows up. Dropping it instead would corrupt
  // exactly the long transcripts that matter most.
  let buffer = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (!line) continue;
      try {
        const event = JSON.parse(line) as {
          type?: string;
          text?: string;
          isFinal?: boolean;
          message?: string;
          fatal?: boolean;
        };
        if (event.type === 'transcript' && typeof event.text === 'string') {
          handlers.onTranscript(event.text, event.isFinal ?? false);
        } else if (event.type === 'error') {
          handlers.onError(event.message ?? 'Dictation failed', { fatal: event.fatal ?? false });
        } else if (event.type === 'open') {
          handlers.onOpen?.();
        }
        // Any other type is ignored on purpose: a kit that starts emitting a new
        // event must not break dictation on an older plugin.
      } catch {
        // A line that is not JSON is noise from the child's runtime, not a
        // transcript. Reporting it as an error would put runtime warnings in
        // the user's text field.
      }
    }
  });

  child.on('error', (err: Error) => {
    if (closed) return;
    handlers.onError(err.message, { fatal: true });
  });

  child.on('close', (code: number | null) => {
    if (closed) return;
    // The child ended without us asking. Its own error line, if it managed one,
    // has already been delivered above; this covers a silent death.
    closed = true;
    if (code !== 0) {
      handlers.onError(`Dictation stopped unexpectedly (exit ${code ?? 'signal'})`, {
        fatal: true,
      });
    }
  });

  return {
    sendAudio: (chunk: Uint8Array) => {
      if (closed) return;
      child.stdin?.write(Buffer.from(chunk));
    },
    close: () =>
      new Promise<void>((resolve) => {
        if (closed) {
          resolve();
          return;
        }
        closed = true;

        // Closing stdin is what tells the child the speaker is done; it then
        // waits for the service to flush the last words before exiting, so the
        // trailing transcript still arrives on stdout.
        const settle = (): void => {
          clearTimeout(guard);
          resolve();
        };
        const guard = setTimeout(() => {
          // A child that will not exit must not hang the UI's stop button.
          child.kill();
          resolve();
        }, CLOSE_TIMEOUT_MS);

        child.once('close', settle);
        child.stdin?.end();
      }),
  };
}

/**
 * Whether this machine can dictate — that is, whether a Claude Code login is
 * available to the kit.
 *
 * @throws ExtendKitMissingError when the package is not installed globally.
 * @throws ExtendKitTooOldError when the installed kit has no `stt` command.
 */
export async function probeSpeechToTextAvailable(workingDir?: string): Promise<boolean> {
  const entry = await resolveCcbEntry();
  await assertSttCapable(entry);

  // The same project the stream will run against, or the answer describes a different one.
  await Claude.applyConfigDir(workingDir);

  const { stdout } = await ccbCommand(entry, ['stt', '--check', '--json'], 20_000, workingDir).exec();
  const parsed = JSON.parse(lastLine(stdout) ?? '{}') as { available?: boolean };
  return parsed.available === true;
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
export async function getExtendKitInstallation(): Promise<{ root: string; version: string } | null> {
  for (const root of await candidateRoots()) {
    try {
      // Read the manifest as a plain file rather than resolving it as a subpath:
      // the package's `exports` map does not list "./package.json" (few do), so
      // asking node to resolve it throws ERR_PACKAGE_PATH_NOT_EXPORTED and an
      // installed kit reports as missing.
      const manifest = `${root}${sep}${EXTEND_KIT_PACKAGE.split('/').join(sep)}${sep}package.json`;
      const { version } = JSON.parse(await readFile(manifest, 'utf8')) as { version?: string };
      if (typeof version === 'string' && version) return { root, version };
    } catch {
      // Not under this root, or an unreadable manifest — try the next one.
    }
  }
  return null;
}

export async function getExtendKitVersion(): Promise<string | null> {
  return (await getExtendKitInstallation())?.version ?? null;
}

/** Forget the cached resolution so a fresh install is picked up without a restart. */
export function resetExtendKitCache(): void {
  cachedRoots = null;
  cachedEntry = null;
  cachedCapabilities = null;
}
