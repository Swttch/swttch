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

/**
 * A display-only alias and/or note for one project, keyed by its working
 * directory. Neither field ever reaches the real filesystem or
 * ~/.claude/projects — the picker substitutes `name` for the folder-derived
 * one wherever it would otherwise show it, and shows `description` in a
 * tooltip. `path` is the source of truth throughout the app; this record
 * exists purely to change what the user SEES for it.
 */
export interface ProjectMetaEntry {
  path: string;
  name?: string;
  description?: string;
}

export interface ProjectsStore {
  /** Working directories pinned to the top of the picker, in pinning order. */
  favoritePaths: string[];
  /** Per-project alias/description overlays. */
  projectMeta: ProjectMetaEntry[];
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

/**
 * Drop entries that name no usable path or carry neither field, and collapse
 * duplicates (first occurrence wins) so a damaged file cannot show two
 * conflicting aliases for the same directory.
 */
export function normalizeProjectMeta(value: unknown): ProjectMetaEntry[] {
  if (!Array.isArray(value)) return [];

  const entries: ProjectMetaEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const { path, name, description } = raw as Partial<ProjectMetaEntry>;
    if (typeof path !== 'string' || path.length === 0) continue;
    if (entries.some((known) => isSameWorkingDir(known.path, path))) continue;

    const cleanName = typeof name === 'string' && name.trim().length > 0 ? name.trim() : undefined;
    const cleanDescription =
      typeof description === 'string' && description.trim().length > 0
        ? description.trim()
        : undefined;
    if (!cleanName && !cleanDescription) continue;

    entries.push({
      path,
      ...(cleanName ? { name: cleanName } : {}),
      ...(cleanDescription ? { description: cleanDescription } : {}),
    });
  }
  return entries;
}

/**
 * The stored aliases/descriptions, or none when the file is absent or
 * unreadable. Same fallback reasoning as readFavoritePaths: this result is
 * only ever displayed, so an empty overlay is the safe failure — the picker
 * falls back to each project's real folder name.
 */
export async function readProjectMeta(): Promise<ProjectMetaEntry[]> {
  const read = await readJsonForUpdate(storePath());
  if (read.status === 'unreadable') {
    console.error('[node-backend]', `could not read ${storePath()}: ${read.reason}`);
    return [];
  }
  return normalizeProjectMeta(read.data.projectMeta);
}

export interface SetProjectMetaResult {
  ok: boolean;
  projectMeta: ProjectMetaEntry[];
}

/**
 * Set (or clear) one project's alias and description, reporting the full
 * overlay as it now stands.
 *
 * Clearing both fields removes the entry rather than leaving an empty shell
 * behind — an entry with neither field is not a fact worth remembering, and
 * normalizeProjectMeta would drop it on the next read anyway.
 *
 * Goes through updateJsonFile for the same reason setProjectFavorite does:
 * this replaces the whole array, so treating an unreadable file as an empty
 * one would turn a failed read into every alias and note being wiped.
 */
export async function setProjectMeta(
  path: string,
  fields: { name?: string; description?: string },
): Promise<SetProjectMetaResult> {
  if (typeof path !== 'string' || path.length === 0) {
    return { ok: true, projectMeta: await readProjectMeta() };
  }

  const name = fields.name?.trim();
  const description = fields.description?.trim();

  let resulting: ProjectMetaEntry[] = [];

  const outcome = await updateJsonFile(storePath(), (current) => {
    const existing = normalizeProjectMeta(current.projectMeta);
    const existingEntry = existing.find((entry) => isSameWorkingDir(entry.path, path));

    const nextEntry: ProjectMetaEntry = {
      path,
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    };
    const hasContent = Boolean(nextEntry.name || nextEntry.description);

    const unchanged = hasContent
      ? existingEntry?.name === nextEntry.name && existingEntry?.description === nextEntry.description
      : !existingEntry;
    if (unchanged) {
      resulting = existing;
      return null;
    }

    const withoutThis = existing.filter((entry) => !isSameWorkingDir(entry.path, path));
    resulting = hasContent ? [...withoutThis, nextEntry] : withoutThis;
    return { ...current, projectMeta: resulting };
  });

  if (outcome.status === 'error') {
    return { ok: false, projectMeta: await readProjectMeta() };
  }
  return { ok: true, projectMeta: resulting };
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
