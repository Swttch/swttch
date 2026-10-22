import { existsSync } from 'fs';
import { parseUncPath } from '../wsl-path';

/**
 * Git Bash (MSYS) writes a Windows drive as `/c/Users/me/x.png`. Claude CLI on
 * Windows runs its shell there, so it hands back paths in that form, and a link the
 * user clicks carries it to the backend untouched. Windows has no such folder.
 */
const GIT_BASH_DRIVE_PATH = /^\/([A-Za-z])\/(.+)$/;
const WINDOWS_DRIVE_PATH = /^([A-Za-z]):[\\/](.*)$/;

/**
 * The other spellings of a clicked path that this machine may know it by.
 *
 * - Windows backend: Git Bash's `/c/…` is `C:/…`.
 * - Linux backend (WSL): the IDE's project folder is a UNC path (`\\wsl$\Ubuntu\home\…`,
 *   which the webview keeps as `//wsl$/Ubuntu/home/…`), and `C:/…` is `/mnt/c/…`.
 */
function alternativeSpellings(filePath: string, platform: NodeJS.Platform): string[] {
  if (platform === 'win32') {
    const gitBash = GIT_BASH_DRIVE_PATH.exec(filePath);
    return gitBash ? [`${gitBash[1].toUpperCase()}:/${gitBash[2]}`] : [];
  }
  if (platform === 'linux') {
    const unc = parseUncPath(filePath);
    if (unc) return [unc.linuxPath];
    const drive = WINDOWS_DRIVE_PATH.exec(filePath);
    return drive ? [`/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, '/')}`] : [];
  }
  return [];
}

/**
 * The path to open for a clicked local file reference.
 *
 * A path that exists as written always wins, so a real `C:\c\foo` is never
 * hijacked. Only when nothing exists at the written path is an alternative spelling
 * tried (kept only if that file exists). Otherwise the input comes back unchanged,
 * so the caller's existence check reports the path the user actually clicked.
 */
export function resolveOpenFilePath(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string {
  if (exists(filePath)) return filePath;
  return alternativeSpellings(filePath, platform).find(exists) ?? filePath;
}
