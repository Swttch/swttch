import { readFile, realpath } from 'fs/promises';
import { join } from 'path';
import { ImportCounts, LegacyImport } from '../entities/migration/LegacyImport';
import { MigrationContext } from '../entities/migration/Migration';
import { PromptCategoryCollection } from '../entities/prompt/PromptCategory.collection';
import { PromptCategory as PromptCategoryEntity } from '../entities/prompt/PromptCategory.entity';
import { PromptCategoryItemLinkCollection } from '../entities/prompt/PromptCategoryItemLink.collection';
import { PromptCategoryItemLink } from '../entities/prompt/PromptCategoryItemLink.entity';
import { PromptItemCollection } from '../entities/prompt/PromptItem.collection';
import { PromptItem } from '../entities/prompt/PromptItem.entity';
import { parseCategoryIds, parseCategoryRecords, type PromptCategory } from '../features/prompts';

/**
 * Moves the prompt library out of the old `prompts.json` files into the entities:
 * the shared file under the home folder, and the file inside every project the
 * program knows of.
 *
 * The old files are READ and never written, renamed or deleted: they are the
 * backup, and going back to an older version finds them exactly as they were.
 *
 * The shared file goes first, because a project file points at the shared
 * categories by their old ids, which are now `uuid` values. Each row is added only
 * if no row stands for it already (same `uuid` in the same project), so a run that
 * is cut off and run again adds what is missing and nothing twice.
 *
 * A file that cannot be read (no permission, or not JSON at all) does not stop the
 * migration: its directory is reported so the user can be told, and everything else
 * is moved. Stopping would hold every entity back for good over one damaged file.
 */

export const LEGACY_DIR_NAME = '.claude-code-gui';
const LEGACY_FILE_NAME = 'prompts.json';
const VALID_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

class LegacyPrompt {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly content: string,
    readonly createdAt: number,
    readonly updatedAt: number,
    readonly categories: string[],
  ) {}
}

class LegacyFile {
  constructor(
    readonly prompts: LegacyPrompt[],
    readonly categories: PromptCategory[],
    /** Rows that could not be read, or that repeat an id already read. */
    readonly skippedCount: number,
  ) {}
}

/** One old file and whose it is: the number of the project, or null for the shared file. */
class LegacyScope {
  constructor(
    readonly projectId: number | null,
    readonly file: LegacyFile,
  ) {}
}

/** Everything the old stores held. */
class LegacyPrompts {
  constructor(
    /** The shared file first, then one per project that has one. */
    readonly scopes: LegacyScope[],
    /** Directories whose file could not be read. */
    readonly unreadable: string[],
  ) {}
}

/** What reading one old file found: the file, nothing, or a reason it cannot be had. */
class LegacyRead {
  private constructor(
    readonly file: LegacyFile | null,
    readonly unreadable: boolean,
  ) {}

  static found(file: LegacyFile): LegacyRead {
    return new LegacyRead(file, false);
  }

  static absent(): LegacyRead {
    return new LegacyRead(null, false);
  }

  static unreadable(): LegacyRead {
    return new LegacyRead(null, true);
  }
}

/**
 * Read an old file with the same leniency the old store had: a malformed row is
 * skipped and counted, never fatal. A file that is absent is nothing to move, and
 * one that cannot be read is reported and left alone.
 */
async function readLegacyFile(filePath: string): Promise<LegacyRead> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR') {
      return LegacyRead.absent();
    }
    console.error('[node-backend]', `could not read ${filePath}:`, err instanceof Error ? err.message : err);
    return LegacyRead.unreadable();
  }
  if (raw.trim() === '') return LegacyRead.found(new LegacyFile([], [], 0));

  let parsed: Record<string, unknown> | null;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown> | null;
  } catch (err) {
    console.error('[node-backend]', `${filePath} is not JSON:`, err instanceof Error ? err.message : err);
    return LegacyRead.unreadable();
  }
  const rawPrompts = Array.isArray(parsed?.prompts) ? (parsed.prompts as unknown[]) : [];
  const rawCategories = Array.isArray(parsed?.categories) ? (parsed.categories as unknown[]) : [];
  const categories = parseCategoryRecords(rawCategories);
  let skippedCount = rawCategories.length - categories.length;

  const seen = new Set<string>();
  const prompts: LegacyPrompt[] = [];
  for (const entry of rawPrompts) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      skippedCount += 1;
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const { id, name, content, createdAt, updatedAt } = candidate;
    if (
      typeof id !== 'string' ||
      !VALID_ID_PATTERN.test(id) ||
      typeof name !== 'string' ||
      typeof content !== 'string' ||
      seen.has(id)
    ) {
      skippedCount += 1;
      continue;
    }
    seen.add(id);
    prompts.push(
      new LegacyPrompt(
        id,
        name,
        content,
        typeof createdAt === 'number' ? createdAt : 0,
        typeof updatedAt === 'number' ? updatedAt : 0,
        parseCategoryIds(candidate.categories),
      ),
    );
  }
  return LegacyRead.found(new LegacyFile(prompts, categories, skippedCount));
}

/** The prompts of a file in the order every screen showed: newest first, ties in the file's own order. */
function newestFirst(file: LegacyFile): LegacyPrompt[] {
  return [...file.prompts].sort((a, b) => b.createdAt - a.createdAt);
}

export default class ImportLegacyPrompts extends LegacyImport<LegacyPrompts> {
  protected async read(context: MigrationContext): Promise<LegacyPrompts | null> {
    const sharedPath = join(context.legacyHome, LEGACY_DIR_NAME, LEGACY_FILE_NAME);
    const sharedReal = await realpath(sharedPath).catch(() => sharedPath);

    const scopes: LegacyScope[] = [];
    const unreadable: string[] = [];

    const shared = await readLegacyFile(sharedPath);
    if (shared.file) scopes.push(new LegacyScope(null, shared.file));
    if (shared.unreadable) unreadable.push(join(context.legacyHome, LEGACY_DIR_NAME));

    for (const project of await context.projects.all()) {
      const projectPath = join(project.path, LEGACY_DIR_NAME, LEGACY_FILE_NAME);
      // A project that is the home folder itself holds the shared file, which is
      // not a project's.
      if ((await realpath(projectPath).catch(() => projectPath)) === sharedReal) continue;

      const old = await readLegacyFile(projectPath);
      if (old.file) scopes.push(new LegacyScope(project.id, old.file));
      if (old.unreadable) unreadable.push(project.path);
    }

    return scopes.length === 0 && unreadable.length === 0 ? null : new LegacyPrompts(scopes, unreadable);
  }

  protected async write(_context: MigrationContext, source: LegacyPrompts): Promise<ImportCounts> {
    return this.writeScopes(source, false);
  }

  /**
   * Read again the folders that could not be read before. A folder whose file reads
   * now is moved in full, after whatever the user has made in that project since,
   * and a folder whose file is gone, or whose project the program no longer knows,
   * is no longer anyone's business. Answers the folders that still cannot be read.
   */
  async retry(context: MigrationContext, folders: string[]): Promise<string[]> {
    const sharedDirectory = join(context.legacyHome, LEGACY_DIR_NAME);
    const sharedPath = join(sharedDirectory, LEGACY_FILE_NAME);
    const sharedReal = await realpath(sharedPath).catch(() => sharedPath);

    const scopes: LegacyScope[] = [];
    const stillUnreadable: string[] = [];

    // The shared file goes first, as in [read]: a project file points at its categories.
    for (const folder of [...folders].sort((a, b) => Number(b === sharedDirectory) - Number(a === sharedDirectory))) {
      if (folder === sharedDirectory) {
        const shared = await readLegacyFile(sharedPath);
        if (shared.file) scopes.push(new LegacyScope(null, shared.file));
        if (shared.unreadable) stillUnreadable.push(folder);
        continue;
      }

      const project = await context.projects.findByPath(folder);
      if (project === null) continue;
      const projectPath = join(project.path, LEGACY_DIR_NAME, LEGACY_FILE_NAME);
      if ((await realpath(projectPath).catch(() => projectPath)) === sharedReal) continue;

      const old = await readLegacyFile(projectPath);
      if (old.file) scopes.push(new LegacyScope(project.id, old.file));
      if (old.unreadable) stillUnreadable.push(folder);
    }

    if (scopes.length > 0) {
      const source = new LegacyPrompts(scopes, stillUnreadable);
      const written = await this.writeScopes(source, true);
      await this.verify(context, source, written);
    }
    return stillUnreadable;
  }

  /**
   * [afterExisting] puts the moved prompts below the ones the library already holds
   * in the same place. On the first run there are none; on a later read of a folder
   * the user may have made prompts in that project meanwhile, and the old ones must
   * not take their places.
   */
  private async writeScopes(source: LegacyPrompts, afterExisting: boolean): Promise<ImportCounts> {
    let prompts = 0;
    let categories = 0;
    let links = 0;
    let skipped = 0;

    for (const scope of source.scopes) {
      const moved = await this.writeScope(scope, afterExisting);
      prompts += moved.prompts;
      categories += moved.categories;
      links += moved.links;
      skipped += moved.skipped;
    }

    return new ImportCounts(
      new Map([
        ['prompts', prompts],
        ['categories', categories],
        ['links', links],
      ]),
      skipped,
      source.unreadable,
    );
  }

  private async writeScope(
    scope: LegacyScope,
    afterExisting: boolean,
  ): Promise<{ prompts: number; categories: number; links: number; skipped: number }> {
    const { projectId, file: legacy } = scope;
    const ordered = newestFirst(legacy);

    const categories = new PromptCategoryCollection();
    if (projectId === null) {
      await categories.insertMissing(
        legacy.categories.map((category, index) =>
          PromptCategoryEntity.draft(category.id, category.name, index + 1, category.createdAt),
        ),
        (stored, candidate) => stored.uuid === candidate.uuid,
      );
    }
    const categoryIdByUuid = new Map((await categories.all()).map((category) => [category.uuid, category.id]));

    const items = new PromptItemCollection();
    const itemOffset = afterExisting
      ? (await items.inScope(projectId)).reduce((highest, item) => Math.max(highest, item.priority), 0)
      : 0;
    await items.insertMissing(
      ordered.map((prompt, index) =>
        PromptItem.draft(projectId, prompt.id, prompt.name, prompt.content, itemOffset + index + 1, prompt.createdAt, prompt.updatedAt),
      ),
      (stored, candidate) => stored.uuid === candidate.uuid && stored.projectId === candidate.projectId,
    );
    const itemIdByUuid = new Map(
      (await items.where((item) => item.belongsTo(projectId))).map((item) => [item.uuid, item.id]),
    );

    // One link per category an item names. An id with no category behind it makes
    // no link, so that prompt reads as uncategorised, and is counted as skipped.
    let skipped = legacy.skippedCount;
    const nextPlace = new Map<number, number>();
    if (afterExisting) {
      for (const link of await new PromptCategoryItemLinkCollection().where((stored) => stored.projectId === projectId)) {
        nextPlace.set(link.categoryId, Math.max(nextPlace.get(link.categoryId) ?? 0, link.priority));
      }
    }
    const wantedLinks: PromptCategoryItemLink[] = [];
    for (const prompt of ordered) {
      const itemId = itemIdByUuid.get(prompt.id);
      if (itemId === undefined) throw new Error(`prompt ${prompt.id} was not written`);
      for (const categoryUuid of prompt.categories) {
        const categoryId = categoryIdByUuid.get(categoryUuid);
        if (categoryId === undefined) {
          skipped += 1;
          continue;
        }
        const priority = (nextPlace.get(categoryId) ?? 0) + 1;
        nextPlace.set(categoryId, priority);
        wantedLinks.push(PromptCategoryItemLink.draft(projectId, categoryId, itemId, priority));
      }
    }
    await new PromptCategoryItemLinkCollection().insertMissing(
      wantedLinks,
      (stored, candidate) => stored.categoryId === candidate.categoryId && stored.itemId === candidate.itemId,
    );

    return {
      prompts: ordered.length,
      categories: projectId === null ? legacy.categories.length : 0,
      links: wantedLinks.length,
      skipped,
    };
  }

  /** Read the rows back and compare them with what was meant to be written. */
  protected async verify(_context: MigrationContext, source: LegacyPrompts, written: ImportCounts): Promise<void> {
    const wantedLinks = written.written.get('links') ?? 0;
    const storedLinks = (await new PromptCategoryItemLinkCollection().all()).length;
    if (storedLinks < wantedLinks) {
      throw new Error(`${wantedLinks - storedLinks} category links are missing after the move`);
    }

    for (const { projectId, file: legacy } of source.scopes) {
      const storedItems = await new PromptItemCollection().where((item) => item.belongsTo(projectId));
      const storedUuids = new Set(storedItems.map((item) => item.uuid));
      const missingPrompts = legacy.prompts.filter((prompt) => !storedUuids.has(prompt.id));
      if (missingPrompts.length > 0) {
        throw new Error(`${missingPrompts.length} prompts are missing after the move`);
      }

      if (projectId === null) {
        const storedCategories = new Set((await new PromptCategoryCollection().all()).map((c) => c.uuid));
        const missingCategories = legacy.categories.filter((category) => !storedCategories.has(category.id));
        if (missingCategories.length > 0) {
          throw new Error(`${missingCategories.length} categories are missing after the move`);
        }
      }
    }
  }
}
