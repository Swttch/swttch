import { readFile } from 'fs/promises';
import { join } from 'path';
import { isSameWorkingDir } from '../../shared';
import { EntityChange } from '../entities/AbstractEntityCollection';
import { ImportCounts, LegacyImport } from '../entities/migration/LegacyImport';
import { MigrationContext } from '../entities/migration/Migration';

/**
 * Moves what the user decided about their projects out of the old
 * `~/.claude-code-gui/projects.json` into the `projects` table: the pinned
 * projects, and the alias and note given to a project.
 *
 * The old file is READ and never written, renamed or deleted. A project in it that
 * the table does not hold yet is registered, so a pinned directory with no session
 * keeps its star. A project that already has a pin, an alias or a note keeps what it
 * has, so running this again changes nothing.
 */

/** One project's alias and note, as the old file held them. */
class LegacyProjectMeta {
  constructor(
    readonly path: string,
    readonly alias: string | null,
    readonly description: string | null,
  ) {}
}

class LegacyProjects {
  constructor(
    /** Pinned directories, in the order they were pinned. */
    readonly favoritePaths: string[],
    readonly meta: LegacyProjectMeta[],
    /** Whether the file existed but could not be read. */
    readonly unreadable: boolean,
    readonly filePath: string,
  ) {}
}

/** The pinned paths of the old file: usable paths only, each once. */
function readFavoritePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const paths: string[] = [];
  for (const path of value) {
    if (typeof path !== 'string' || path.length === 0) continue;
    if (paths.some((known) => isSameWorkingDir(known, path))) continue;
    paths.push(path);
  }
  return paths;
}

/** The aliases and notes of the old file: those with a usable path and at least one of the two, first one wins. */
function readProjectMeta(value: unknown): LegacyProjectMeta[] {
  if (!Array.isArray(value)) return [];
  const entries: LegacyProjectMeta[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const { path, name, description } = raw as Record<string, unknown>;
    if (typeof path !== 'string' || path.length === 0) continue;
    if (entries.some((known) => isSameWorkingDir(known.path, path))) continue;

    const alias = typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
    const note = typeof description === 'string' && description.trim().length > 0 ? description.trim() : null;
    if (alias === null && note === null) continue;
    entries.push(new LegacyProjectMeta(path, alias, note));
  }
  return entries;
}

export default class ImportLegacyProjectsJson extends LegacyImport<LegacyProjects> {
  protected async read(context: MigrationContext): Promise<LegacyProjects | null> {
    const filePath = join(context.legacyHome, '.claude-code-gui', 'projects.json');
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      console.error('[node-backend]', `could not read ${filePath}:`, err instanceof Error ? err.message : err);
      return new LegacyProjects([], [], true, filePath);
    }
    if (raw.trim() === '') return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error('[node-backend]', `${filePath} is not JSON:`, err instanceof Error ? err.message : err);
      return new LegacyProjects([], [], true, filePath);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return new LegacyProjects([], [], true, filePath);
    }

    const object = parsed as Record<string, unknown>;
    return new LegacyProjects(readFavoritePaths(object.favoritePaths), readProjectMeta(object.projectMeta), false, filePath);
  }

  protected async write(context: MigrationContext, source: LegacyProjects): Promise<ImportCounts> {
    const projects = context.projects;
    const unreadable = source.unreadable ? [source.filePath] : [];
    let pinned = 0;
    let described = 0;
    let skipped = 0;

    // Strictly after each other, so the order of pinning is the order of the file.
    const base = Date.now();
    for (const [index, path] of source.favoritePaths.entries()) {
      try {
        const id = await projects.idOf(path);
        await projects.mutate((rows) => {
          const row = rows.find((candidate) => candidate.id === id);
          if (!row || row.isFavorite) return EntityChange.keep(rows, undefined);
          row.favoritedAt = base + index;
          return EntityChange.write(rows, undefined);
        });
        pinned += 1;
      } catch (err) {
        console.error('[node-backend]', `could not move the pin of ${path}:`, err instanceof Error ? err.message : err);
        skipped += 1;
      }
    }

    for (const entry of source.meta) {
      try {
        const id = await projects.idOf(entry.path);
        await projects.mutate((rows) => {
          const row = rows.find((candidate) => candidate.id === id);
          if (!row || row.alias !== null || row.description !== null) return EntityChange.keep(rows, undefined);
          row.alias = entry.alias;
          row.description = entry.description;
          return EntityChange.write(rows, undefined);
        });
        described += 1;
      } catch (err) {
        console.error('[node-backend]', `could not move the alias of ${entry.path}:`, err instanceof Error ? err.message : err);
        skipped += 1;
      }
    }

    return new ImportCounts(
      new Map([
        ['pinned projects', pinned],
        ['aliases and notes', described],
      ]),
      skipped,
      unreadable,
    );
  }

  protected async verify(context: MigrationContext, source: LegacyProjects): Promise<void> {
    for (const path of source.favoritePaths) {
      const row = await context.projects.findByPath(path).catch(() => null);
      // A path that cannot be a project here was skipped on the way in and counted.
      if (row && !row.isFavorite) throw new Error(`the pin of ${path} is missing after the move`);
    }
    for (const entry of source.meta) {
      const row = await context.projects.findByPath(entry.path).catch(() => null);
      if (row && row.alias === null && row.description === null) {
        throw new Error(`the alias of ${entry.path} is missing after the move`);
      }
    }
  }
}
