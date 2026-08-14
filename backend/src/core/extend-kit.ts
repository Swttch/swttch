import { createRequire } from 'node:module';
import { sep } from 'node:path';
import { realpath, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Command, ShellKind } from './command';

/** The npm package this module loads. Also the name shown when it is missing. */
export const EXTEND_KIT_PACKAGE = '@swttch/extend-kit';

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
 * `npm root -g` alone is not enough. Under a version manager (volta, nvm, fnm)
 * the `npm` a login shell resolves can belong to a different Node than the one
 * that owns the global folder the package actually landed in — on this machine
 * npm answered `/opt/homebrew/lib/node_modules` while the package sat under
 * `~/.volta`. Asking only npm produced a "not installed" error for a package
 * that was installed.
 *
 * So we also follow `ccb`, the binary this same package provides. Resolving the
 * command the way the usage panel already does, then walking up from the
 * symlink it points at, lands in the real install regardless of which manager
 * put it there.
 */
async function candidateRoots(): Promise<string[]> {
  if (cachedRoots) return cachedRoots;

  const roots: string[] = [];

  // 1. Follow the ccb binary — survives version managers.
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
      if (at > 0) roots.push(real.slice(0, at + marker.length - 1));
    }
  } catch {
    // ccb not installed, or the link could not be read — try npm next.
  }

  // 2. Whatever npm considers global, for installs that did not link a bin.
  try {
    const { stdout } = await new Command('npm', ['root', '-g'], {
      timeout: 15000,
      shell: ShellKind.LoginInteractive,
    }).exec();
    const root = lastLine(stdout);
    if (root && !roots.includes(root)) roots.push(root);
  } catch {
    // Neither path worked; the caller reports it as missing.
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
      const manifest = createRequire(`${root}${sep}`).resolve(
        `${EXTEND_KIT_PACKAGE}/package.json`,
      );
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
