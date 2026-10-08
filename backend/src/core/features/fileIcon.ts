import { readMacIcon } from './fileIconMac';
import { readWindowsIcon } from './fileIconWindows';
import { readLinuxIcon } from './fileIconLinux';

/**
 * The icon the operating system draws for a file type: the app icon a `.kts`
 * opens with, the page with the browser's mark that a PDF gets. It is the same
 * picture the file manager shows, so a chip reads like the file does everywhere
 * else on the machine.
 *
 * Each system is asked its own way (see the three `fileIcon*` modules), and every
 * way may come back empty. An empty answer is ordinary: the chip keeps the icon it
 * draws itself, so an icon from the system is a bonus and never a reason for a
 * chip to look wrong.
 */
export interface FileIcon {
  mimeType: 'image/png' | 'image/svg+xml';
  /** The picture, base64. */
  base64: string;
}

/** Asks the system for the icon of one extension; null when it has none to give. */
export type IconSource = (extension: string) => Promise<FileIcon | null>;

/** What reaches a shell or a script as an argument, so only the characters an extension can hold. */
export const EXTENSION_PATTERN = /^[a-z0-9][a-z0-9_+-]{0,15}$/;

const SOURCES: Partial<Record<NodeJS.Platform, IconSource>> = {
  darwin: (extension) => readMacIcon(extension),
  win32: (extension) => readWindowsIcon(extension),
  linux: (extension) => readLinuxIcon(extension),
};

/** How the given system is asked, or undefined for one nobody has written a way for. */
export function iconSourceFor(platform: NodeJS.Platform): IconSource | undefined {
  return SOURCES[platform];
}

/** Icons already fetched, by extension: the system is asked once per type, not once per file. */
const cache = new Map<string, Promise<FileIcon | null>>();

export async function readFileIcon(
  extension: string,
  options: { platform?: NodeJS.Platform; source?: IconSource } = {},
): Promise<FileIcon | null> {
  const { platform = process.platform } = options;
  const source = options.source ?? iconSourceFor(platform);
  if (!source) return null;

  const key = extension.toLowerCase();
  if (!EXTENSION_PATTERN.test(key)) return null;

  const known = cache.get(key);
  if (known) return known;

  const pending = source(key).catch((): FileIcon | null => {
    // A script that timed out or failed says nothing lasting about the type, so
    // it is asked again next time rather than remembered as "no icon".
    cache.delete(key);
    return null;
  });
  cache.set(key, pending);
  return pending;
}

/** @internal test-only: forget every fetched icon. */
export function _resetFileIconCache(): void {
  cache.clear();
}
