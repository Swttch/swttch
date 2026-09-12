import { ALL_CATEGORIES, UNCATEGORISED, type CategorySelection } from './promptCategories';
import type { PromptScope } from '@/types/prompt';

/**
 * Dragging a prompt onto a category to file it there.
 *
 * The rule lives here as a pure function rather than in either screen, because
 * both the library modal and the `!!` panel offer the same gesture and a drop
 * has to mean the same thing in each. Two copies would drift the first time one
 * of them learned about a new sentinel row.
 */

/** The dnd-kit `type` a dragged prompt carries. */
export const PROMPT_DRAG_TYPE = 'prompt';
/** The dnd-kit `type` a category row accepts. */
export const CATEGORY_DROP_TYPE = 'prompt-category';

/** What a dragged prompt carries with it. */
export interface PromptDragData {
  promptId: string;
  scope: PromptScope;
  /** The categories it is filed under right now, so the drop can add to them. */
  categories: string[];
}

/** What a category row carries as a drop target. */
export interface CategoryDropData {
  /** A category id, or one of the two sentinel rows. */
  key: CategorySelection;
}

export function readPromptDrag(data: unknown): PromptDragData | null {
  if (!data || typeof data !== 'object') return null;
  const { promptId, scope, categories } = data as Partial<PromptDragData>;
  if (typeof promptId !== 'string' || (scope !== 'global' && scope !== 'project')) return null;
  return { promptId, scope, categories: Array.isArray(categories) ? categories : [] };
}

export function readCategoryDrop(data: unknown): CategoryDropData | null {
  if (!data || typeof data !== 'object') return null;
  const { key } = data as Partial<CategoryDropData>;
  return typeof key === 'string' ? { key } : null;
}

/**
 * The categories a prompt should carry after being dropped on [key], or null
 * when the drop changes nothing and no write should happen.
 *
 * - A real category is ADDED rather than replacing what is there. A prompt can
 *   carry several, and a drag says "also this", not "only this" — replacing
 *   would silently throw away the filing the user already did.
 * - "Uncategorised" is the way back out: it clears them. Without it a prompt
 *   filed by dragging could only be unfiled through the edit form.
 * - "All" is not a category, so dropping on it means nothing. Refusing the drop
 *   is the honest answer; pretending it did something would be worse.
 */
export function categoriesAfterDrop(current: string[], key: CategorySelection): string[] | null {
  if (key === ALL_CATEGORIES) return null;
  if (key === UNCATEGORISED) return current.length === 0 ? null : [];
  if (current.includes(key)) return null;
  return [...current, key];
}

/** Whether dropping on [key] would do anything, for previewing the target. */
export function acceptsDrop(current: string[], key: CategorySelection): boolean {
  return categoriesAfterDrop(current, key) !== null;
}
