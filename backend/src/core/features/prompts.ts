import { randomUUID } from 'crypto';
import { EntityChange } from '../entities/AbstractEntityCollection';
import { ProjectCollection } from '../entities/project/Project.collection';
import { PromptCategoryCollection } from '../entities/prompt/PromptCategory.collection';
import { PromptCategoryItemLinkCollection } from '../entities/prompt/PromptCategoryItemLink.collection';
import { PromptCategoryItemLink } from '../entities/prompt/PromptCategoryItemLink.entity';
import { PromptItemCollection } from '../entities/prompt/PromptItem.collection';
import { PromptItem } from '../entities/prompt/PromptItem.entity';

/**
 * The prompt library: phrases the user saves once and pastes into the composer
 * with `!!`, instead of retyping them every session.
 *
 * This is OUR store, not the CLI's. The Claude Code CLI has no equivalent
 * feature — its custom slash commands under `.claude/commands/` are EXECUTED
 * when sent, while a saved prompt is text the user pastes, reads and edits
 * before sending. Keeping the two apart is deliberate: writing saved phrases
 * into `.claude/commands/` would make every one of them an executable command
 * in the CLI's `/` list, which is not what the user asked the library to be.
 *
 * Rows live in the entity files under the user data directory (see
 * core/entities): prompts in `prompt_items`, categories in `prompt_categories`
 * and the many-to-many between them in `prompt_category_item_links`. A prompt of
 * the global scope has no `projectId`; a project prompt carries its project's.
 * A project is named by its path everywhere outside the entity files, and
 * {@link resolveScopeProject} is where a request's path becomes that number.
 *
 * Everything this module hands out is the WIRE shape the webview has always been
 * given: ids are the `uuid` column, and a prompt's `categories` are category
 * uuids. The integer `id` never leaves the backend.
 */

/** Where one prompt is stored. Independent of any category it may carry. */
export type PromptScope = 'global' | 'project';

/**
 * One saved prompt, in the shape the webview receives.
 *
 * A class and not a bare shape: the app never holds a prompt as a plain object,
 * and the webview gets it through `toJSON`.
 */
export class SavedPrompt {
  /**
   * The uuids of the categories this prompt belongs to, or absent for the
   * uncategorised group.
   *
   * A list rather than one id: "review this diff" is both a review prompt and a
   * git prompt, and making the user pick one would push them into inventing a
   * category that means both.
   */
  categories?: string[];

  constructor(
    /** Stable identifier (the `uuid` column), assigned on creation and never rewritten. */
    readonly id: string,
    /** Display name, shown in the `!!` panel and on the settings card. */
    readonly name: string,
    /** The text pasted into the composer when the user picks this prompt. */
    readonly content: string,
    /** Creation time in epoch milliseconds. */
    readonly createdAt: number,
    /** Last edit time in epoch milliseconds. Equals createdAt until first edit. */
    readonly updatedAt: number,
    categories: string[] = [],
  ) {
    if (categories.length > 0) this.categories = categories;
  }

  /** The same prompt with other categories (none removes the key). */
  withCategories(categories: string[]): SavedPrompt {
    return new SavedPrompt(this.id, this.name, this.content, this.createdAt, this.updatedAt, categories);
  }

  /** The same prompt under another id. */
  withId(id: string): SavedPrompt {
    return new SavedPrompt(id, this.name, this.content, this.createdAt, this.updatedAt, this.categories);
  }

  /** The same prompt with the text, times and categories of [other], keeping this id. */
  replacedBy(other: SavedPrompt): SavedPrompt {
    return new SavedPrompt(this.id, other.name, other.content, other.createdAt, other.updatedAt, other.categories);
  }
}

/**
 * One category, named once and referenced by its uuid.
 *
 * Categories belong to no project: one set spans both scopes.
 */
export class PromptCategory {
  constructor(
    /** The `uuid` column. */
    readonly id: string,
    /** What the user called it. The only place this name is written. */
    readonly name: string,
    /** Creation time in epoch milliseconds. */
    readonly createdAt: number,
    /**
     * Place in the category column. The "All" row is fixed at 0, so a negative
     * number is above it and a positive one below it; smaller is higher. Only the
     * stored categories carry it: a category read from an export file has none.
     */
    readonly priority?: number,
  ) {}
}

/**
 * Stands for the "All" row in a category order. It is not a category and has no
 * row of its own; the order says where it sits among the categories. Must equal
 * `ALL_CATEGORIES` in the webview.
 */
export const PROMPT_ALL_CATEGORIES_ID = '__all__';

export type PromptResult =
  | { status: 'ok'; prompt: SavedPrompt }
  | { status: 'error'; error: string };

export type PromptDeleteResult =
  | { status: 'ok' }
  | { status: 'error'; error: string };

/**
 * Name and content limits.
 *
 * The name sits on one row of a dropdown, so it has to stay scannable; 60
 * characters is long enough for a sentence-shaped Korean name and still short
 * enough to read at a glance. The content limit only exists to stop a pasted
 * file from becoming a prompt by accident.
 */
export const PROMPT_NAME_MAX_LENGTH = 60;
/** Same reasoning as the name: a category sits on one sidebar row. */
export const PROMPT_CATEGORY_MAX_LENGTH = 60;
/**
 * A ceiling on how many categories one prompt may carry.
 *
 * Not a design limit so much as a guard: the field is free text arriving over
 * IPC, and a list with no bound is a list something can fill.
 */
export const PROMPT_CATEGORIES_MAX_COUNT = 20;
export const PROMPT_CONTENT_MAX_LENGTH = 100000;

/** Ids on the wire are uuids we generated, so reject anything that did not come from us. */
const VALID_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

/**
 * Read the category ids written on a prompt.
 *
 * Only well-formed ids are kept. Duplicates are collapsed, because one category
 * twice on one prompt would file it under the same heading twice.
 */
export function parseCategoryIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!VALID_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= PROMPT_CATEGORIES_MAX_COUNT) break;
  }
  return ids;
}

/** Read the category records of an export file, dropping anything that is not one. */
export function parseCategoryRecords(value: unknown): PromptCategory[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const categories: PromptCategory[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    const { id, name, createdAt } = candidate;
    if (typeof id !== 'string' || !VALID_ID_PATTERN.test(id) || seenIds.has(id)) continue;
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > PROMPT_CATEGORY_MAX_LENGTH) continue;
    seenIds.add(id);
    categories.push(new PromptCategory(id, trimmed, typeof createdAt === 'number' ? createdAt : 0));
  }
  return categories;
}

type ScopeProject = { status: 'ok'; projectId: number | null } | { status: 'error'; error: string };

/**
 * The `projectId` a scope's rows carry: null for global, the number of the
 * project at [projectPath] for project scope (a directory seen for the first time
 * is registered here), or an error when project scope names no project.
 */
export async function resolveScopeProject(scope: PromptScope, projectPath?: string): Promise<ScopeProject> {
  if (scope === 'global') return { status: 'ok', projectId: null };
  if (!projectPath) return { status: 'error', error: 'projectPath required for project scope' };
  try {
    return { status: 'ok', projectId: await new ProjectCollection().idOf(projectPath) };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/** The prompts of one scope in the library's order, and what they are filed under. */
class ScopeSnapshot {
  private constructor(
    readonly items: PromptItem[],
    /** Item internal id → category uuids, in the order the item was filed. */
    private readonly categoriesOfItem: Map<number, string[]>,
  ) {}

  static async read(projectId: number | null): Promise<ScopeSnapshot> {
    const [items, categories, links] = await Promise.all([
      new PromptItemCollection().inScope(projectId),
      new PromptCategoryCollection().all(),
      new PromptCategoryItemLinkCollection().where((link) => link.belongsTo(projectId)),
    ]);

    const categoryUuidById = new Map(categories.map((category) => [category.id, category.uuid]));
    const categoriesOfItem = new Map<number, string[]>();
    for (const link of [...links].sort((a, b) => a.id - b.id)) {
      const uuid = categoryUuidById.get(link.categoryId);
      if (uuid === undefined) continue;
      const filed = categoriesOfItem.get(link.itemId) ?? [];
      filed.push(uuid);
      categoriesOfItem.set(link.itemId, filed);
    }
    return new ScopeSnapshot(items, categoriesOfItem);
  }

  toWire(item: PromptItem): SavedPrompt {
    return new SavedPrompt(
      item.uuid,
      item.name,
      item.content,
      item.createdAt,
      item.updatedAt,
      this.categoriesOfItem.get(item.id) ?? [],
    );
  }

  wirePrompts(): SavedPrompt[] {
    return this.items.map((item) => this.toWire(item));
  }
}

/**
 * Read one scope's prompts in the library's own order ("All" order).
 *
 * Unlike a missing project, an entity file that exists and cannot be read throws:
 * an empty list would look like every prompt was lost, and the caller must say
 * that the library could not be loaded instead.
 */
export async function readPrompts(scope: PromptScope, projectPath?: string): Promise<SavedPrompt[]> {
  const resolved = await resolveScopeProject(scope, projectPath);
  if (resolved.status === 'error') return [];
  return (await ScopeSnapshot.read(resolved.projectId)).wirePrompts();
}

/**
 * The order of the prompts inside each category, for one scope: category uuid to
 * the prompt uuids filed under it, top first.
 */
export async function readPromptOrderByCategory(
  scope: PromptScope,
  projectPath?: string,
): Promise<Map<string, string[]>> {
  const resolved = await resolveScopeProject(scope, projectPath);
  if (resolved.status === 'error') return new Map();

  const [items, categories, links] = await Promise.all([
    new PromptItemCollection().inScope(resolved.projectId),
    new PromptCategoryCollection().all(),
    new PromptCategoryItemLinkCollection().where((link) => link.belongsTo(resolved.projectId)),
  ]);
  const itemUuidById = new Map(items.map((item) => [item.id, item.uuid]));

  const order = new Map<string, string[]>();
  for (const category of categories) {
    const uuids = links
      .filter((link) => link.categoryId === category.id)
      .sort((a, b) => a.priority - b.priority)
      .map((link) => itemUuidById.get(link.itemId))
      .filter((uuid): uuid is string => uuid !== undefined);
    if (uuids.length > 0) order.set(category.uuid, uuids);
  }
  return order;
}

function validateNameAndContent(name: string, content: string): string | null {
  const trimmedName = name.trim();
  if (trimmedName === '') return 'Prompt name must not be empty';
  if (trimmedName.length > PROMPT_NAME_MAX_LENGTH) {
    return `Prompt name must be at most ${PROMPT_NAME_MAX_LENGTH} characters`;
  }
  if (content === '') return 'Prompt content must not be empty';
  if (content.length > PROMPT_CONTENT_MAX_LENGTH) {
    return `Prompt content must be at most ${PROMPT_CONTENT_MAX_LENGTH} characters`;
  }
  return null;
}

/** Move every item of [projectId] down [by] places, making room at the top. */
async function makeRoomAtTop(items: PromptItemCollection, projectId: number | null, by: number): Promise<void> {
  await items.mutate((entities) => {
    const inScope = entities.filter((item) => item.belongsTo(projectId));
    if (inScope.length === 0) return EntityChange.keep(entities, undefined);
    for (const item of inScope) item.priority += by;
    return EntityChange.write(entities, undefined);
  });
}

/** Move every link into [categoryId] within [projectId] down [by] places, making room at the top. */
async function makeRoomInCategory(
  links: PromptCategoryItemLinkCollection,
  projectId: number | null,
  categoryId: number,
  by: number,
): Promise<void> {
  await links.mutate((entities) => {
    const inCategory = entities.filter((link) => link.belongsTo(projectId) && link.categoryId === categoryId);
    if (inCategory.length === 0) return EntityChange.keep(entities, undefined);
    for (const link of inCategory) link.priority += by;
    return EntityChange.write(entities, undefined);
  });
}

/** File [itemId] under [categoryId] at the top of that category's own order. */
async function fileOnTop(
  links: PromptCategoryItemLinkCollection,
  projectId: number | null,
  categoryId: number,
  itemId: number,
): Promise<void> {
  await makeRoomInCategory(links, projectId, categoryId, 1);
  await links.insert(PromptCategoryItemLink.draft(projectId, categoryId, itemId, 1));
}

/** The internal ids of the categories among [uuids] that exist, in the order given. */
async function existingCategoryIds(uuids: string[]): Promise<number[]> {
  if (uuids.length === 0) return [];
  const categories = await new PromptCategoryCollection().all();
  const idByUuid = new Map(categories.map((category) => [category.uuid, category.id]));
  return uuids.map((uuid) => idByUuid.get(uuid)).filter((id): id is number => id !== undefined);
}

/** Add one prompt at the top of its scope, filed at the top of each category it names. */
async function addAtTop(
  projectId: number | null,
  prompt: SavedPrompt,
  categoryUuids: string[],
): Promise<PromptItem> {
  const items = new PromptItemCollection();
  const links = new PromptCategoryItemLinkCollection();

  await makeRoomAtTop(items, projectId, 1);
  const item = await items.insert(
    PromptItem.draft(projectId, prompt.id, prompt.name, prompt.content, 1, prompt.createdAt, prompt.updatedAt),
  );
  for (const categoryId of await existingCategoryIds(categoryUuids)) {
    await fileOnTop(links, projectId, categoryId, item.id);
  }
  return item;
}

/** Add one prompt to a scope. The backend owns the id and both timestamps. */
export async function createPrompt(
  scope: PromptScope,
  projectPath: string | undefined,
  name: string,
  content: string,
  categories?: unknown,
): Promise<PromptResult> {
  const validationError = validateNameAndContent(name, content);
  if (validationError) return { status: 'error', error: validationError };
  const resolved = await resolveScopeProject(scope, projectPath);
  if (resolved.status === 'error') return resolved;

  try {
    const now = Date.now();
    const item = await addAtTop(
      resolved.projectId,
      new SavedPrompt(randomUUID(), name.trim(), content, now, now),
      parseCategoryIds(categories),
    );
    return { status: 'ok', prompt: (await ScopeSnapshot.read(resolved.projectId)).toWire(item) };
  } catch (err) {
    return failure('Failed to write prompts:', err);
  }
}

/**
 * Edit one prompt's name, content and categories. `id` and `createdAt` are not
 * editable: the id is what the webview's cached rows are keyed by.
 */
export async function updatePrompt(
  scope: PromptScope,
  projectPath: string | undefined,
  id: string,
  name: string,
  content: string,
  categories?: unknown,
): Promise<PromptResult> {
  if (!VALID_ID_PATTERN.test(id)) return { status: 'error', error: `Invalid prompt id: ${id}` };
  const validationError = validateNameAndContent(name, content);
  if (validationError) return { status: 'error', error: validationError };
  const resolved = await resolveScopeProject(scope, projectPath);
  if (resolved.status === 'error') return resolved;

  try {
    const items = new PromptItemCollection();
    const existing = (await items.inScope(resolved.projectId)).find((item) => item.uuid === id);
    if (!existing) return { status: 'error', error: `Prompt not found: ${id}` };

    existing.name = name.trim();
    existing.content = content;
    existing.updatedAt = Date.now();
    await items.save(existing);
    await replaceFiling(resolved.projectId, existing.id, parseCategoryIds(categories));

    return { status: 'ok', prompt: (await ScopeSnapshot.read(resolved.projectId)).toWire(existing) };
  } catch (err) {
    return failure('Failed to write prompts:', err);
  }
}

/** Make [itemId] sit in exactly the categories named by [uuids], keeping the places it already has. */
async function replaceFiling(projectId: number | null, itemId: number, uuids: string[]): Promise<void> {
  const links = new PromptCategoryItemLinkCollection();
  const wanted = await existingCategoryIds(uuids);
  const current = await links.ofItem(itemId);

  const staleIds = new Set(
    current.filter((link) => !wanted.includes(link.categoryId)).map((link) => link.id),
  );
  if (staleIds.size > 0) {
    await links.mutate((entities) =>
      EntityChange.write(
        entities.filter((link) => !staleIds.has(link.id)),
        undefined,
      ),
    );
  }
  const filed = new Set(current.map((link) => link.categoryId));
  for (const categoryId of wanted) {
    if (!filed.has(categoryId)) await fileOnTop(links, projectId, categoryId, itemId);
  }
}

/** Remove one prompt from a scope. Deleting an absent id is an error, not a no-op. */
export async function deletePrompt(
  scope: PromptScope,
  projectPath: string | undefined,
  id: string,
): Promise<PromptDeleteResult> {
  if (!VALID_ID_PATTERN.test(id)) return { status: 'error', error: `Invalid prompt id: ${id}` };
  const resolved = await resolveScopeProject(scope, projectPath);
  if (resolved.status === 'error') return resolved;

  try {
    const items = new PromptItemCollection();
    const existing = (await items.inScope(resolved.projectId)).find((item) => item.uuid === id);
    if (!existing) return { status: 'error', error: `Prompt not found: ${id}` };
    await removeItems(items, new Set([existing.id]));
    return { status: 'ok' };
  } catch (err) {
    return failure('Failed to write prompts:', err);
  }
}

/** Remove items and every link out of them. */
async function removeItems(items: PromptItemCollection, itemIds: Set<number>): Promise<void> {
  await items.mutate((entities) =>
    EntityChange.write(
      entities.filter((item) => !itemIds.has(item.id)),
      undefined,
    ),
  );
  await new PromptCategoryItemLinkCollection().mutate((entities) =>
    EntityChange.write(
      entities.filter((link) => !itemIds.has(link.itemId)),
      undefined,
    ),
  );
}

/** Places 1, 2, 3… for [named] in the order given, then for the ids of [rest] not already named. */
function ranksOf(named: number[], rest: number[]): Map<number, number> {
  return new Map([...new Set([...named, ...rest])].map((id, index) => [id, index + 1]));
}

/**
 * Put the prompts of one scope in the order [orderedIds] gives, or the order
 * inside one category when [categoryId] is named.
 *
 * Ids the order does not mention keep their relative places after the named ones,
 * and ids that are not in the scope are ignored, so a stale drag from a screen
 * that has not seen a deletion cannot fail the whole move.
 */
export async function reorderPrompts(
  scope: PromptScope,
  projectPath: string | undefined,
  orderedIds: string[],
  categoryId?: string,
): Promise<{ status: 'ok' } | { status: 'error'; error: string }> {
  const resolved = await resolveScopeProject(scope, projectPath);
  if (resolved.status === 'error') return resolved;

  try {
    const items = new PromptItemCollection();
    const inScope = await items.inScope(resolved.projectId);
    const internalIdByUuid = new Map(inScope.map((item) => [item.uuid, item.id]));
    const named = orderedIds
      .map((uuid) => internalIdByUuid.get(uuid))
      .filter((id): id is number => id !== undefined);

    if (categoryId === undefined) {
      const rank = ranksOf(named, inScope.map((item) => item.id));
      await items.mutate((entities) => {
        for (const item of entities) {
          const place = rank.get(item.id);
          if (item.belongsTo(resolved.projectId) && place !== undefined) item.priority = place;
        }
        return EntityChange.write(entities, undefined);
      });
      return { status: 'ok' };
    }

    const category = (await new PromptCategoryCollection().all()).find((c) => c.uuid === categoryId);
    if (!category) return { status: 'error', error: `Category not found: ${categoryId}` };

    const links = new PromptCategoryItemLinkCollection();
    const inCategory = (await links.inCategory(category.id)).filter((link) => link.belongsTo(resolved.projectId));
    const linkByItem = new Map(inCategory.map((link) => [link.itemId, link.id]));
    const namedLinks = named
      .map((itemId) => linkByItem.get(itemId))
      .filter((id): id is number => id !== undefined);
    const rank = ranksOf(namedLinks, inCategory.map((link) => link.id));
    await links.mutate((entities) => {
      for (const link of entities) {
        const place = rank.get(link.id);
        if (place !== undefined) link.priority = place;
      }
      return EntityChange.write(entities, undefined);
    });
    return { status: 'ok' };
  } catch (err) {
    return failure('Failed to write prompts:', err);
  }
}

/**
 * Run a read-modify-write over one scope's prompts: read them in wire shape, let
 * [mutate] answer the list that should be stored (or a message to refuse), and
 * bring the entity files in line with that list.
 *
 * [categoryOrder] is asked for after [mutate] has run, and answers the order the
 * prompts that are new to the scope should have inside each category (category
 * uuid to prompt ids, top first).
 *
 * Exported so prompt-transfer.ts can fold an imported set in through the same
 * path every other write uses. The dependency runs one way: this module owns the
 * store and knows nothing about files being carried in or out.
 */
export async function mutatePromptStore(
  scope: PromptScope,
  projectPath: string | undefined,
  mutate: (prompts: SavedPrompt[]) => SavedPrompt[] | string,
  categoryOrder: () => Map<string, string[]> = () => new Map(),
): Promise<{ status: 'ok' } | { status: 'error'; error: string }> {
  const resolved = await resolveScopeProject(scope, projectPath);
  if (resolved.status === 'error') return resolved;

  try {
    const snapshot = await ScopeSnapshot.read(resolved.projectId);
    const current = snapshot.wirePrompts();
    const next = mutate(current);
    if (typeof next === 'string') return { status: 'error', error: next };
    await bringInLine(resolved.projectId, snapshot, current, next, categoryOrder());
    return { status: 'ok' };
  } catch (err) {
    return failure('Failed to write prompts:', err);
  }
}

/**
 * Make the stored scope equal [next]: delete what is gone, edit what changed,
 * and add what is new on top in the order [next] lists it.
 *
 * Inside a category the new prompts also go on top. They keep the order
 * [categoryOrder] gives for that category (category uuid to prompt ids, top
 * first), and any the order does not mention follow in the order [next] lists
 * them.
 */
async function bringInLine(
  projectId: number | null,
  snapshot: ScopeSnapshot,
  current: SavedPrompt[],
  next: SavedPrompt[],
  categoryOrder: Map<string, string[]>,
): Promise<void> {
  const items = new PromptItemCollection();
  const itemByUuid = new Map(snapshot.items.map((item) => [item.uuid, item]));
  const currentByUuid = new Map(current.map((prompt) => [prompt.id, prompt]));
  const nextIds = new Set(next.map((prompt) => prompt.id));

  const goneIds = new Set(
    snapshot.items.filter((item) => !nextIds.has(item.uuid)).map((item) => item.id),
  );
  if (goneIds.size > 0) await removeItems(items, goneIds);

  const added: SavedPrompt[] = [];
  for (const prompt of next) {
    const before = currentByUuid.get(prompt.id);
    const item = itemByUuid.get(prompt.id);
    if (!before || !item) {
      added.push(prompt);
      continue;
    }
    const sameFiling =
      JSON.stringify([...(before.categories ?? [])].sort()) ===
      JSON.stringify([...(prompt.categories ?? [])].sort());
    if (
      before.name !== prompt.name ||
      before.content !== prompt.content ||
      before.createdAt !== prompt.createdAt ||
      before.updatedAt !== prompt.updatedAt
    ) {
      item.name = prompt.name;
      item.content = prompt.content;
      item.createdAt = prompt.createdAt;
      item.updatedAt = prompt.updatedAt;
      await items.save(item);
    }
    if (!sameFiling) await replaceFiling(projectId, item.id, prompt.categories ?? []);
  }

  if (added.length === 0) return;

  // Room for all of them at once, then each takes the place its position in the
  // incoming list gives it, so the file's order survives the import.
  await makeRoomAtTop(items, projectId, added.length);
  const createdIdByUuid = new Map<string, number>();
  for (const [index, prompt] of added.entries()) {
    const item = await items.insert(
      PromptItem.draft(projectId, prompt.id, prompt.name, prompt.content, index + 1, prompt.createdAt, prompt.updatedAt),
    );
    createdIdByUuid.set(prompt.id, item.id);
  }

  // Each category the new prompts are filed under gets them all at once, on top
  // of what it already holds, in one block.
  const links = new PromptCategoryItemLinkCollection();
  const members = new Map<string, string[]>();
  for (const prompt of added) {
    for (const categoryUuid of prompt.categories ?? []) {
      members.set(categoryUuid, [...(members.get(categoryUuid) ?? []), prompt.id]);
    }
  }
  for (const [categoryUuid, promptIds] of members) {
    const [categoryId] = await existingCategoryIds([categoryUuid]);
    if (categoryId === undefined) continue;

    const wanted = categoryOrder.get(categoryUuid) ?? [];
    const rank = (id: string) => {
      const place = wanted.indexOf(id);
      return place === -1 ? Number.MAX_SAFE_INTEGER : place;
    };
    // A stable sort: those the order does not mention keep their incoming order.
    const ordered = [...promptIds].sort((a, b) => rank(a) - rank(b));

    await makeRoomInCategory(links, projectId, categoryId, ordered.length);
    await links.insertMissing(
      ordered.map((id, index) =>
        PromptCategoryItemLink.draft(projectId, categoryId, createdIdByUuid.get(id) as number, index + 1),
      ),
      (stored, candidate) => stored.categoryId === candidate.categoryId && stored.itemId === candidate.itemId,
    );
  }
}

function failure(label: string, err: unknown): { status: 'error'; error: string } {
  const error = err instanceof Error ? err.message : String(err);
  console.error('[node-backend]', label, err);
  return { status: 'error', error };
}
