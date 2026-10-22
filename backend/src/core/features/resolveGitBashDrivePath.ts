import { existsSync } from 'fs';

/**
 * Git Bash (MSYS) writes a Windows drive as `/c/Users/me/x.png`. Claude CLI on
 * Windows runs its shell there, so it hands back paths in that form, and a link the
 * user clicks carries it to the backend untouched. Windows has no such folder, so
 * the file looks missing even though `C:\Users\me\x.png` is right there.
 */
const GIT_BASH_DRIVE_PATH = /^\/([A-Za-z])\/(.+)$/;

/**
 * The path to open for a clicked local file reference.
 *
 * A path that exists as written always wins, so a real `C:\c\foo` is never
 * hijacked. Only when nothing exists at the written path, on Windows, is the Git
 * Bash drive form translated to `C:/…` (and kept only if that file exists). Every
 * other case returns the input unchanged, so the caller's existence check reports
 * the original path.
 */
export function resolveGitBashDrivePath(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string {
  if (platform !== 'win32' || exists(filePath)) return filePath;
  const match = GIT_BASH_DRIVE_PATH.exec(filePath);
  if (!match) return filePath;
  const translated = `${match[1].toUpperCase()}:/${match[2]}`;
  return exists(translated) ? translated : filePath;
}
