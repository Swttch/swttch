import { existsSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { posix, win32 } from 'path';
import { fileURLToPath } from 'url';
import { parseUncPath } from '../wsl-path';
import { findMarkdownHeadingLine } from './markdownHeadingLine';

/**
 * Turns a clicked file reference into the file on this machine and the place in it.
 *
 * A reference is not always a path as the disk spells it. It can carry a position
 * (`a.ts:12`, `#L3`), a heading (`README.md#setup`), a home or project-relative
 * start, or the spelling of another side of the machine (Git Bash, WSL). Every one
 * of those is a candidate, and **only the disk picks**: a path that exists as
 * written always wins, so a `#` or a `:` that is part of a name is never cut off.
 */

/** The file to open and, when the reference named one, the place in it. */
export interface OpenFileTarget {
  path: string;
  /** 1-based. */
  line?: number;
  /** 1-based. */
  column?: number;
}

export interface ResolveOpenFileOptions {
  /** The project the reference was clicked in: relative paths are read from it. */
  workingDir?: string;
  platform?: NodeJS.Platform;
  home?: string;
  exists?: (path: string) => boolean;
  isFile?: (path: string) => boolean;
  /** The text of a markdown file, to find the heading a fragment names. */
  readText?: (path: string) => string;
}

/** A markdown file larger than this is opened at the top rather than read for its headings. */
const MAX_HEADING_SEARCH_BYTES = 2 * 1024 * 1024;

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function readMarkdown(path: string): string {
  try {
    return statSync(path).size > MAX_HEADING_SEARCH_BYTES ? '' : readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** `C:/…`, `C:\…`. */
const WINDOWS_DRIVE_PATH = /^([A-Za-z]):[\\/](.*)$/;
/** `/C:/…`: a drive behind the slash a URL puts in front of it. */
const SLASHED_DRIVE_PATH = /^\/([A-Za-z]:[\\/].*)$/;
/**
 * Git Bash (MSYS) writes a Windows drive as `/c/Users/me/x.png`, Cygwin as
 * `/cygdrive/c/…` and WSL as `/mnt/c/…`. Claude CLI hands back paths in these
 * forms, and a link the user clicks carries it to the backend untouched. Windows
 * has no such folder.
 */
const POSIX_DRIVE_PATH = /^\/(?:(?:cygdrive|mnt)\/)?([A-Za-z])\/(.+)$/;

/**
 * The other spellings of an absolute path that this machine may know it by.
 *
 * - Windows backend: `/c/…` and `/mnt/c/…` are `C:/…`, and a Linux path in a WSL
 *   project (its folder is `\\wsl$\Ubuntu\…`) is a path under that share.
 * - Linux backend (WSL): the IDE's project folder is a UNC path (`\\wsl$\Ubuntu\home\…`,
 *   which the webview keeps as `//wsl$/Ubuntu/home/…`), and `C:/…` is `/mnt/c/…`.
 */
function alternativeSpellings(filePath: string, platform: NodeJS.Platform, workingDir: string | undefined): string[] {
  const slashed = SLASHED_DRIVE_PATH.exec(filePath)?.[1];
  const path = slashed ?? filePath;
  const spellings = slashed === undefined ? [] : [slashed];

  if (platform === 'win32') {
    const posixDrive = POSIX_DRIVE_PATH.exec(path);
    if (posixDrive) spellings.push(`${posixDrive[1].toUpperCase()}:/${posixDrive[2]}`);
    const project = parseUncPath(workingDir);
    if (project && workingDir && path.startsWith('/') && !path.startsWith('//')) {
      const host = workingDir.replace(/\\/g, '/').replace(/^\/+/, '').split('/')[0];
      spellings.push(`//${host}/${project.distro}${path}`);
    }
  }
  if (platform === 'linux') {
    const unc = parseUncPath(path);
    if (unc) spellings.push(unc.linuxPath);
    const drive = WINDOWS_DRIVE_PATH.exec(path);
    if (drive) spellings.push(`/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, '/')}`);
  }
  return spellings;
}

const ABSOLUTE_PATH = /^(?:\/|\\\\|[A-Za-z]:[\\/])/;
const HOME_PATH = /^~(?=$|[\\/])/;

/** `text` and, where they differ, its percent-decoded and Unicode-normalized spellings. */
function encodings(text: string): string[] {
  const texts = [text];
  if (/%[0-9A-Fa-f]{2}/.test(text)) {
    try {
      texts.push(decodeURIComponent(text));
    } catch {
      // Not an encoding after all: the `%` is part of the name.
    }
  }
  // A file system that compares bytes holds a name composed or decomposed, whichever made it.
  return [...new Set(texts.flatMap((each) => [each, each.normalize('NFC'), each.normalize('NFD')]))];
}

/** Where a path written as `text` may be on disk, best first. */
function locations(text: string, options: Required<Pick<ResolveOpenFileOptions, 'platform' | 'home'>> & { workingDir?: string }): string[] {
  const { platform, home, workingDir } = options;
  const absolute = (path: string) => [path, ...alternativeSpellings(path, platform, workingDir)];
  return encodings(text).flatMap((path) => {
    if (HOME_PATH.test(path)) return absolute(path.replace(HOME_PATH, () => home));
    if (ABSOLUTE_PATH.test(path)) return absolute(path);
    // A relative path is the project's. Read as written it would be looked up in the
    // backend's own folder, which holds files of the same names that nobody clicked.
    if (!workingDir) return [path];
    const { join } = platform === 'win32' ? win32 : posix;
    return absolute(workingDir).map((folder) => join(folder, path));
  });
}

interface Reading {
  text: string;
  line?: number;
  column?: number;
  /** The `#…` taken off the end. */
  fragment?: string;
  /** A reading that cut something off must land on a file, never on a folder. */
  cut: boolean;
}

/** `#L10C5-L20`, `:10`, `:10:5`, `:L10`, `:10-20`, `(10,5)`: groups are the start line and column. */
const POSITIONS = [
  /#L(\d+)(?:C(\d+))?(?:-L?\d+(?:C\d+)?)?$/,
  /:L?(\d+)(?::(\d+))?(?:-L?\d+(?::\d+)?)?$/,
  /\((\d+)(?:,\s*(\d+))?\)$/,
];

/** The ways to read a clicked reference, the literal one first. */
function readings(requested: string): Reading[] {
  const found: Reading[] = [{ text: requested, cut: false }];
  if (/^file:/i.test(requested)) {
    try {
      found.push(...readings(fileURLToPath(requested.replace(/#.*$/, ''))).map((reading) => ({
        ...reading,
        fragment: reading.fragment ?? requested.split('#')[1],
      })));
    } catch {
      // A URL naming another machine: left as written.
    }
    return found;
  }
  for (const pattern of POSITIONS) {
    const match = pattern.exec(requested);
    if (!match) continue;
    found.push({
      text: requested.slice(0, match.index),
      line: Number(match[1]),
      column: match[2] ? Number(match[2]) : undefined,
      cut: true,
    });
  }
  // From the last `#` or `?` backwards, so a name that holds one is kept as long as it can be.
  for (let at = requested.length - 1; at > 0; at--) {
    if (requested[at] !== '#' && requested[at] !== '?') continue;
    found.push({
      text: requested.slice(0, at),
      fragment: requested[at] === '#' ? requested.slice(at + 1) : undefined,
      cut: true,
    });
  }
  return found;
}

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/**
 * The file and position for a clicked local file reference.
 *
 * When nothing on disk answers to any reading of it, the input comes back as the
 * path, so the caller's existence check reports what the user actually clicked.
 */
export function resolveOpenFilePath(requested: string, options: ResolveOpenFileOptions = {}): OpenFileTarget {
  const {
    workingDir,
    platform = process.platform,
    home = homedir(),
    exists = existsSync,
    isFile = isRegularFile,
    readText = readMarkdown,
  } = options;

  for (const reading of readings(requested)) {
    const path = locations(reading.text, { workingDir, platform, home }).find(reading.cut ? isFile : exists);
    if (path === undefined) continue;
    let { line } = reading;
    if (line === undefined && reading.fragment && /\.(?:md|markdown|mdx)$/i.test(path)) {
      line = findMarkdownHeadingLine(readText(path), decodeFragment(reading.fragment));
    }
    return {
      path,
      ...(line === undefined ? {} : { line }),
      ...(reading.column === undefined ? {} : { column: reading.column }),
    };
  }
  return { path: requested };
}
