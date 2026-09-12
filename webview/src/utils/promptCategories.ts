import type { SavedPrompt } from '@/types/prompt';

/**
 * Grouping prompts by the category their author gave them.
 *
 * A flat list stops being scannable somewhere around a dozen prompts, and the
 * useful groupings are the user's own way of working — "debugging", "commit
 * messages", "the thing I say to start a session" — not a set we could pick for
 * them. So the category is free text and this only arranges what is there.
 */

/** One heading and the prompts under it. */
export interface PromptGroup {
  /**
   * The category name, or null for the prompts that have none. Null rather than
   * a translated "Uncategorised" so the caller owns the wording.
   */
  category: string | null;
  prompts: SavedPrompt[];
}

/**
 * Arrange [prompts] under their categories, keeping the order they arrived in.
 *
 * Categories appear in the order their first prompt does, so a list the user
 * just reordered does not reshuffle its headings. The uncategorised group is
 * always last: it is where a prompt sits when nobody has decided yet, so it is
 * the least interesting place to look.
 */
export function groupPromptsByCategory(prompts: SavedPrompt[]): PromptGroup[] {
  const byCategory = new Map<string, SavedPrompt[]>();
  const uncategorised: SavedPrompt[] = [];

  for (const prompt of prompts) {
    const category = prompt.category?.trim() ?? '';
    if (category === '') {
      uncategorised.push(prompt);
      continue;
    }
    const existing = byCategory.get(category);
    if (existing) existing.push(prompt);
    else byCategory.set(category, [prompt]);
  }

  const groups: PromptGroup[] = [...byCategory.entries()].map(([category, items]) => ({
    category,
    prompts: items,
  }));
  if (uncategorised.length > 0) groups.push({ category: null, prompts: uncategorised });
  return groups;
}

/**
 * Flatten groups back into the order they are drawn in.
 *
 * The arrow keys walk the drawn order, and grouping changes it: a prompt that
 * was third in the list may be first under its heading. Building the walk order
 * from the same grouping is what keeps the highlight on the row the user sees.
 */
export function flattenGroups(groups: PromptGroup[]): SavedPrompt[] {
  return groups.flatMap((group) => group.prompts);
}

/**
 * The categories already in use, for offering them while writing a prompt.
 *
 * Free text invites near-duplicates ("Debug" and "debugging"), and the cheapest
 * guard against that is showing what already exists while the user types.
 */
export function existingCategories(prompts: SavedPrompt[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const prompt of prompts) {
    const category = prompt.category?.trim() ?? '';
    if (category === '' || seen.has(category)) continue;
    seen.add(category);
    names.push(category);
  }
  return names.sort((a, b) => a.localeCompare(b));
}
