import { EntityChange } from '../entities/AbstractEntityCollection';
import { ProjectCollection } from '../entities/project/Project.collection';
import type { Project } from '../entities/project/Project.entity';

/**
 * What the user decided about a project, kept on the project's own row: pinning it
 * to the top of the picker, and an alias and a note shown instead of the folder's
 * name.
 *
 * None of it reaches the real folder or the CLI's records. The picker substitutes
 * the alias for the folder-derived name wherever it would otherwise show it, and
 * shows the note in a tooltip.
 *
 * The webview is still told about it the way it always was: a list of pinned paths
 * and a list of `{ path, name, description }` overlays, built here from the rows.
 */

/** One project's alias and note, in the shape the webview receives. */
export class ProjectMetaEntry {
  constructor(
    readonly path: string,
    readonly name?: string,
    readonly description?: string,
  ) {}

  static of(project: Project): ProjectMetaEntry {
    return new ProjectMetaEntry(project.path, project.alias ?? undefined, project.description ?? undefined);
  }
}

export class SetProjectFavoriteResult {
  constructor(
    readonly ok: boolean,
    readonly favoritePaths: string[],
  ) {}
}

export class SetProjectMetaResult {
  constructor(
    readonly ok: boolean,
    readonly projectMeta: ProjectMetaEntry[],
  ) {}
}

/** The pinned projects' directories, in the order they were pinned. */
export async function readFavoritePaths(): Promise<string[]> {
  const projects = await new ProjectCollection().all();
  return projects
    .filter((project) => project.isFavorite)
    .sort((a, b) => a.favoritedAt - b.favoritedAt || a.id - b.id)
    .map((project) => project.path);
}

/** The aliases and notes of every project that has either, in the order the projects were first seen. */
export async function readProjectMeta(): Promise<ProjectMetaEntry[]> {
  const projects = await new ProjectCollection().all();
  return projects
    .filter((project) => project.alias !== null || project.description !== null)
    .sort((a, b) => a.id - b.id)
    .map((project) => ProjectMetaEntry.of(project));
}

/**
 * Pin or unpin one working directory, reporting the list as it now stands.
 *
 * Pinning a directory the program has not seen registers it. A failure to save
 * answers `ok: false` along with the list as it was, so the webview can take back
 * a star it drew before the answer came.
 */
export async function pinProject(path: string, favorite: boolean): Promise<SetProjectFavoriteResult> {
  if (typeof path !== 'string' || path.length === 0) {
    return new SetProjectFavoriteResult(true, await readFavoritePaths());
  }

  try {
    const projects = new ProjectCollection();
    const id = await projects.idOf(path);
    await projects.mutate((rows) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row || row.isFavorite === favorite) return EntityChange.keep(rows, undefined);
      // Strictly after every pin there is, so the order of pinning survives two pins in one millisecond.
      row.favoritedAt = favorite ? Math.max(Date.now(), ...rows.map((candidate) => candidate.favoritedAt + 1)) : 0;
      return EntityChange.write(rows, undefined);
    });
    return new SetProjectFavoriteResult(true, await readFavoritePaths());
  } catch (err) {
    console.error('[node-backend]', `could not ${favorite ? 'pin' : 'unpin'} ${path}:`, err);
    return new SetProjectFavoriteResult(false, await readFavoritePaths().catch(() => []));
  }
}

/**
 * Take a project off the list the picker shows, after its CLI records were
 * deleted. The row stays: prompts and other rows of the project point at it, and a
 * project that is opened again must get its old number back. The project is listed
 * again when a session newer than this appears.
 *
 * Does nothing for a directory the program never registered.
 */
export async function hideProject(path: string): Promise<void> {
  const projects = new ProjectCollection();
  const known = await projects.findByPath(path);
  if (!known) return;

  await projects.mutate((rows) => {
    const row = rows.find((candidate) => candidate.id === known.id);
    if (!row) return EntityChange.keep(rows, undefined);
    row.hiddenAt = Date.now();
    row.sessionCount = 0;
    return EntityChange.write(rows, undefined);
  });
}

/**
 * Set (or clear) one project's alias and note, reporting every overlay as it now
 * stands.
 *
 * Clearing both removes the overlay rather than leaving an empty shell: a project
 * with neither is not one the user said anything about.
 */
export async function describeProject(
  path: string,
  fields: { name?: string; description?: string },
): Promise<SetProjectMetaResult> {
  if (typeof path !== 'string' || path.length === 0) {
    return new SetProjectMetaResult(true, await readProjectMeta());
  }

  const alias = fields.name?.trim() || null;
  const description = fields.description?.trim() || null;

  try {
    const projects = new ProjectCollection();
    // Clearing what was never set must not be the thing that registers a project.
    const id =
      alias === null && description === null ? (await projects.findByPath(path))?.id : await projects.idOf(path);
    if (id !== undefined) {
      await projects.mutate((rows) => {
        const row = rows.find((candidate) => candidate.id === id);
        if (!row || (row.alias === alias && row.description === description)) {
          return EntityChange.keep(rows, undefined);
        }
        row.alias = alias;
        row.description = description;
        return EntityChange.write(rows, undefined);
      });
    }
    return new SetProjectMetaResult(true, await readProjectMeta());
  } catch (err) {
    console.error('[node-backend]', `could not save the alias of ${path}:`, err);
    return new SetProjectMetaResult(false, await readProjectMeta().catch(() => []));
  }
}
