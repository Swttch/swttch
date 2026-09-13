import type { PromptCategory, SavedPrompt } from '@/types/prompt';

/**
 * Reading the categories a prompt belongs to.
 *
 * A prompt stores category IDS, never names: the name lives in exactly one
 * record, so renaming a category is one write and every prompt follows. That
 * makes "what is this prompt filed under" a lookup rather than a field read,
 * which is what these helpers are for.
 *
 * The library does not draw category headings. It filters: the sidebar holds
 * the categories and picking one narrows the lists beside it. Headings would
 * repeat a prompt under every category it carries, which is exactly what
 * letting a prompt carry several was for.
 */

/** The sentinel the sidebar uses for "show everything". */
export const ALL_CATEGORIES = '__all__';
/** The sentinel the sidebar uses for "prompts filed under nothing". */
export const UNCATEGORISED = '__uncategorised__';

/** What the sidebar's selection can be: a category id, or one of the two sentinels. */
export type CategorySelection = string;

/**
 * Whether [prompt] belongs in the list for [selection].
 *
 * An id with no record behind it counts as uncategorised rather than as a
 * category of its own, so a prompt whose category was deleted stays reachable
 * instead of disappearing into a heading that no longer exists.
 */
export function matchesCategorySelection(
  prompt: SavedPrompt,
  selection: CategorySelection,
  categories: PromptCategory[],
): boolean {
  if (selection === ALL_CATEGORIES) return true;

  const known = new Set(categories.map((category) => category.id));
  const filed = (prompt.categories ?? []).filter((id) => known.has(id));

  if (selection === UNCATEGORISED) return filed.length === 0;
  return filed.includes(selection);
}

/** How many of [prompts] each sidebar row would show. */
export function countByCategory(
  prompts: SavedPrompt[],
  categories: PromptCategory[],
): { all: number; uncategorised: number; byId: Map<string, number> } {
  const known = new Set(categories.map((category) => category.id));
  const byId = new Map<string, number>(categories.map((category) => [category.id, 0]));
  let uncategorised = 0;

  for (const prompt of prompts) {
    const filed = (prompt.categories ?? []).filter((id) => known.has(id));
    if (filed.length === 0) {
      uncategorised += 1;
      continue;
    }
    // Counted once per category it carries, because it appears in each of them.
    for (const id of filed) byId.set(id, (byId.get(id) ?? 0) + 1);
  }

  return { all: prompts.length, uncategorised, byId };
}

/** The names of the categories [prompt] is filed under, in the sidebar's order. */
export function categoryNamesOf(
  prompt: SavedPrompt,
  categories: PromptCategory[],
): string[] {
  const filed = new Set(prompt.categories ?? []);
  return categories.filter((category) => filed.has(category.id)).map((category) => category.name);
}

/**
 * Whether [prompt] answers [query] through one of its category names.
 *
 * Typing a category's name in the `!!` panel has to reach its prompts, which is
 * the other half of what grouping is for: browse by the sidebar, or name the
 * group and skip it.
 */
export function matchesCategoryName(
  prompt: SavedPrompt,
  query: string,
  categories: PromptCategory[],
): boolean {
  const lowered = query.trim().toLowerCase();
  if (lowered === '') return true;
  return categoryNamesOf(prompt, categories).some((name) =>
    name.toLowerCase().includes(lowered),
  );
}
