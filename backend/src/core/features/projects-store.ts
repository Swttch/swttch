import { join } from 'path';
import { homedir } from 'os';
import { isSameWorkingDir } from '../../shared';
import { readJsonForUpdate, updateJsonFile } from './atomic-json';

/**
 * Per-user state about projects, kept apart from the projects themselves.
 *
 *   ~/.claude-code-gui/projects.json
 *     { "favoritePaths": ["/Users/me/app"] }
 *
 * The project list itself is derived from `~/.claude/projects` and belongs to
 * the CLI; this file holds only what the user decided ABOUT those projects, so
 * nothing here is ever needed to render the list. A missing or damaged file
 * costs the pins, not the projects.
 *
 * It sits beside `profile.json` rather than inside it because pinning is the
 * first of several project-scoped decisions (sort order, deletion, and further
 * per-project metadata), and profile.json is about the install: a pseudonymous
 * id, telemetry consent, a game score.
 */

export interface ProjectsStore {
  /** Working directories pinned to the top of the picker, in pinning order. */
  favoritePaths: string[];
}

function storePath(): string {
  return join(homedir(), '.claude-code-gui', 'projects.json');
}

/**
 * Drop entries that are not usable paths, and collapse duplicates.
 *
 * Duplicates matter because unpinning removes matches once. Two copies of one
 * path in a hand-edited or half-written file would leave a star that needs two
 * clicks to clear.
 */
export function normalizeFavoritePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const paths: string[] = [];
  for (const path of value) {
    if (typeof path !== 'string' || path.length === 0) continue;
    if (paths.some((known) => isSameWorkingDir(known, path))) continue;
    paths.push(path);
  }
  return paths;
}

/**
 * The stored pins, or none when the file is absent or unreadable.
 *
 * Falling back to an empty list is safe HERE because this result is only ever
 * displayed: the picker shows an unpinned list rather than failing to open. The
 * write path below must not reuse this fallback — see setProjectFavorite.
 */
export async function readFavoritePaths(): Promise<string[]> {
  const read = await readJsonForUpdate(storePath());
  if (read.status === 'unreadable') {
    console.error('[node-backend]', `could not read ${storePath()}: ${read.reason}`);
    return [];
  }
  return normalizeFavoritePaths(read.data.favoritePaths);
}

export interface SetProjectFavoriteResult {
  ok: boolean;
  favoritePaths: string[];
}

/**
 * Pin or unpin one working directory, reporting the list as it now stands.
 *
 * The read-modify-write goes through updateJsonFile, which refuses to write
 * over a file it could not read (issue #386). That refusal is the point: this
 * function replaces the whole `favoritePaths` array, so treating an unreadable
 * file as an empty one would turn a failed read into a wiped list of pins.
 *
 * Sameness is decided by isSameWorkingDir, not string equality. A pin is stored
 * as it was spelled when pinned, and the same directory can arrive spelled
 * differently later (Windows case, or the other separator), which would leave a
 * star that pins but never unpins.
 */
export async function setProjectFavorite(
  path: string,
  favorite: boolean,
): Promise<SetProjectFavoriteResult> {
  if (typeof path !== 'string' || path.length === 0) {
    return { ok: true, favoritePaths: await readFavoritePaths() };
  }

  let resulting: string[] = [];

  const outcome = await updateJsonFile(storePath(), (current) => {
    const existing = normalizeFavoritePaths(current.favoritePaths);
    const pinned = existing.some((known) => isSameWorkingDir(known, path));

    if (favorite === pinned) {
      // Already in the wanted state; leave the file alone.
      resulting = existing;
      return null;
    }

    resulting = favorite
      ? [...existing, path]
      : existing.filter((known) => !isSameWorkingDir(known, path));

    // Spread `current` so any other key in the file survives a version of this
    // app that does not know about it yet.
    return { ...current, favoritePaths: resulting };
  });

  if (outcome.status === 'error') {
    return { ok: false, favoritePaths: await readFavoritePaths() };
  }
  return { ok: true, favoritePaths: resulting };
}
