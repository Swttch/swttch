import { execFile } from 'child_process';
import { readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import type { FileIcon } from './fileIcon';

/**
 * Linux has no one call that answers "what icon does this type get". The desktop
 * answers it in three steps from files every freedesktop system keeps, and this
 * module takes the same three steps:
 *
 *   1. the shared MIME database says which MIME type an extension is
 *      (`mime/globs2`: `50:application/pdf:*.pdf`),
 *   2. the type names the icon (`application-pdf`), with the database's generic
 *      icon for the family (`x-office-document`) and the media class
 *      (`text-x-generic`) as the next best,
 *   3. the icon theme holds the picture, as an svg or a png of some size.
 *
 * Nothing here needs a desktop session or a toolkit, so it also works from a
 * backend started in a terminal. A machine without the MIME database or without
 * an icon theme simply has no answer, and the chip keeps the icon it draws itself.
 */

/** Where the three steps read from. Tests point it at a directory they built. */
export interface LinuxIconEnv {
  /** `mime/globs2` files, in any order; the highest weight wins. */
  globsFiles: string[];
  /** `mime/generic-icons` files. */
  genericIconsFiles: string[];
  /** Directories that hold icon themes (`<root>/<theme>/...`). */
  iconRoots: string[];
  /** Theme names, most preferred first. */
  themes: () => Promise<string[]>;
}

/** An icon bigger than this is not worth putting in a message. */
const MAX_ICON_BYTES = 256 * 1024;

/** Sizes a png is looked for in, nearest to the 28 pixels a card draws at 2x first. */
const PNG_SIZES = [64, 48, 96, 128, 32, 256];

/** Themes tried after the one the person chose, which cover most desktops. */
const FALLBACK_THEMES = ['Adwaita', 'breeze', 'Humanity', 'gnome', 'hicolor'];

function dataDirs(): string[] {
  const home = process.env.XDG_DATA_HOME?.trim() || join(homedir(), '.local', 'share');
  const system = (process.env.XDG_DATA_DIRS?.trim() || '/usr/local/share:/usr/share').split(':').filter(Boolean);
  return [home, ...system];
}

function gsettingsTheme(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'gsettings',
      ['get', 'org.gnome.desktop.interface', 'icon-theme'],
      { timeout: 2000 },
      (error, stdout) => resolve(error ? null : stdout.trim().replace(/^'|'$/g, '') || null),
    );
  });
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

/** The themes a theme says it builds on, in `index.theme`'s `Inherits=` line. */
async function inheritsOf(theme: string, iconRoots: string[]): Promise<string[]> {
  for (const root of iconRoots) {
    const text = await readIfExists(join(root, theme, 'index.theme'));
    const line = text?.split('\n').find((l) => l.startsWith('Inherits='));
    if (line) return line.slice('Inherits='.length).split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

export function defaultLinuxIconEnv(): LinuxIconEnv {
  const dirs = dataDirs();
  const iconRoots = [join(dirs[0], 'icons'), join(homedir(), '.icons'), ...dirs.slice(1).map((d) => join(d, 'icons'))];
  return {
    globsFiles: dirs.map((d) => join(d, 'mime', 'globs2')),
    genericIconsFiles: dirs.map((d) => join(d, 'mime', 'generic-icons')),
    iconRoots,
    themes: async () => {
      const chosen = await gsettingsTheme();
      const inherited = chosen ? await inheritsOf(chosen, iconRoots) : [];
      return [...new Set([...(chosen ? [chosen] : []), ...inherited, ...FALLBACK_THEMES])];
    },
  };
}

/** Step 1: the MIME type of an extension, from the heaviest rule that names it. */
export async function mimeTypeFor(extension: string, globsFiles: string[]): Promise<string | null> {
  let best: { weight: number; mime: string } | null = null;
  for (const file of globsFiles) {
    const text = await readIfExists(file);
    if (!text) continue;
    for (const line of text.split('\n')) {
      if (line.startsWith('#') || !line) continue;
      const [weight, mime, glob, flags] = line.split(':');
      // Rules marked case-sensitive (`cs`) would not match a lower-cased extension.
      if (glob?.toLowerCase() !== `*.${extension}` || flags?.includes('cs')) continue;
      const w = Number(weight);
      if (!best || w > best.weight) best = { weight: w, mime };
    }
  }
  return best?.mime ?? null;
}

/** Step 2: icon names for a MIME type, the most specific first. */
export async function iconNamesFor(mime: string, genericIconsFiles: string[]): Promise<string[]> {
  const names = [mime.replace('/', '-')];
  for (const file of genericIconsFiles) {
    const text = await readIfExists(file);
    const line = text?.split('\n').find((l) => l.startsWith(`${mime}:`));
    if (line) names.push(line.slice(mime.length + 1).trim());
  }
  names.push(`${mime.split('/')[0]}-x-generic`);
  return [...new Set(names)];
}

/** Where a theme may keep the picture of an icon, best first: scalable, then png sizes. */
function candidatePaths(theme: string, name: string): string[] {
  const svg = [join(theme, 'scalable', 'mimetypes', `${name}.svg`), join(theme, 'mimetypes', 'scalable', `${name}.svg`)];
  const png = PNG_SIZES.flatMap((size) => [
    join(theme, `${size}x${size}`, 'mimetypes', `${name}.png`),
    join(theme, 'mimetypes', String(size), `${name}.png`),
  ]);
  return [...svg, ...png];
}

async function fileSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

/** Step 3: the first picture of the first name any theme holds. */
export async function findIcon(names: string[], themes: string[], iconRoots: string[]): Promise<FileIcon | null> {
  // The specific name wins over the generic one in any theme, rather than the other
  // way round: a PDF should get a PDF icon from the second theme before a plain
  // page from the first.
  for (const name of names) {
    for (const theme of themes) {
      for (const root of iconRoots) {
        for (const relative of candidatePaths(theme, name)) {
          const path = join(root, relative);
          const size = await fileSize(path);
          if (size === null || size > MAX_ICON_BYTES) continue;
          const bytes = await readFile(path);
          return { mimeType: path.endsWith('.svg') ? 'image/svg+xml' : 'image/png', base64: bytes.toString('base64') };
        }
      }
    }
  }
  return null;
}

export async function readLinuxIcon(extension: string, env: LinuxIconEnv = defaultLinuxIconEnv()): Promise<FileIcon | null> {
  const mime = await mimeTypeFor(extension, env.globsFiles);
  if (!mime) return null;
  const names = await iconNamesFor(mime, env.genericIconsFiles);
  return findIcon(names, await env.themes(), env.iconRoots);
}
