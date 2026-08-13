import { createRequire } from 'node:module';
import { Command, ShellKind } from './command';

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
 * Resolution mirrors how `ccb` is found: ask npm where its global root is
 * through a login shell, because a GUI-launched backend inherits a minimal
 * PATH that usually does not include the npm global bin.
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
    super('@swttch/extend-kit is not installed');
    this.name = 'ExtendKitMissingError';
  }
}

let cachedRoot: string | null = null;
let cachedStt: ExtendKitStt | null = null;

/**
 * The npm global root (`npm root -g`), resolved through a login shell so the
 * rc-file PATH is in play. Cached: it does not change while we run, and the
 * login shell spawn is slow enough to be worth doing once.
 */
async function npmGlobalRoot(): Promise<string> {
  if (cachedRoot) return cachedRoot;
  const { stdout } = await new Command('npm', ['root', '-g'], {
    timeout: 15000,
    shell: ShellKind.LoginInteractive,
  }).exec();
  // A login shell may print rc-file noise before the path; the path is the last
  // non-empty line rather than the whole of stdout.
  const root = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
  if (!root) throw new ExtendKitMissingError();
  cachedRoot = root;
  return root;
}

/**
 * Load the kit's speech-to-text module.
 *
 * @throws ExtendKitMissingError when the package is not installed globally.
 */
export async function loadSpeechToText(): Promise<ExtendKitStt> {
  if (cachedStt) return cachedStt;

  let root: string;
  try {
    root = await npmGlobalRoot();
  } catch {
    throw new ExtendKitMissingError();
  }

  // createRequire gives us node's own resolution rooted at the global folder,
  // so subpath exports and the package's own dependencies (ws) resolve the way
  // they would for any consumer.
  const requireFromGlobal = createRequire(`${root}/`);
  let entry: string;
  try {
    entry = requireFromGlobal.resolve('@swttch/extend-kit/stt');
  } catch {
    throw new ExtendKitMissingError();
  }

  try {
    const mod = (await import(`file://${entry}`)) as ExtendKitStt;
    if (typeof mod.openSpeechToTextStream !== 'function') throw new ExtendKitMissingError();
    cachedStt = mod;
    return mod;
  } catch (err) {
    if (err instanceof ExtendKitMissingError) throw err;
    throw new ExtendKitMissingError();
  }
}

/** Forget the cached resolution so a fresh install is picked up without a restart. */
export function resetExtendKitCache(): void {
  cachedRoot = null;
  cachedStt = null;
}
