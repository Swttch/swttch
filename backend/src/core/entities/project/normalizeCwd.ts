import { realpathSync } from 'fs';
import { isAbsolute, posix, resolve, win32 } from 'path';

/**
 * The one spelling of a project directory that is stored in a `cwd` column and
 * compared against it.
 *
 * Every entity carries a `cwd`, and rows are found again by comparing it with the
 * directory a project is opened from. Two spellings of the same folder would
 * split one project's rows in two, so the spelling is settled here, before
 * anything is written, and the same function is used when reading.
 *
 * - Relative paths are refused. They resolve against whatever directory the
 *   process happens to be in, which says nothing about a project.
 * - `..`, doubled separators and a trailing separator are removed.
 * - Symbolic links are followed, and on a case-insensitive filesystem the
 *   on-disk spelling is used, so `/tmp/x` and `/private/tmp/X` agree.
 * - A directory that no longer exists keeps its resolved spelling rather than
 *   failing: rows belonging to a deleted or unmounted project must stay
 *   addressable.
 * - On Windows the drive letter is upper-cased.
 */
export function normalizeCwd(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') throw new Error('cwd must not be empty');
  // On Windows a path that starts with one slash and has no drive is a POSIX path
  // (from WSL, or a transcript written elsewhere). `resolve` would put the current
  // drive in front of it and name a folder that is not the one the path meant.
  if (process.platform === 'win32' && /^\/(?!\/)/.test(trimmed)) return trimmed;

  if (!isAbsolute(trimmed)) {
    // Absolute on another platform (a Windows path in a transcript read on macOS):
    // no file system here can settle its spelling, so it is kept as it was written.
    if (win32.isAbsolute(trimmed) || posix.isAbsolute(trimmed)) return trimmed;
    throw new Error(`cwd must be an absolute path, got "${input}"`);
  }

  let normalized = resolve(trimmed);
  try {
    normalized = realpathSync.native(normalized);
  } catch {
    // The directory is gone, or is on a drive that is not mounted right now.
  }

  if (process.platform === 'win32') {
    normalized = normalized.replace(/^[a-z]:/, (drive) => drive.toUpperCase());
  }
  return normalized;
}
