import type { DockItemId, DockLayout } from '@/types/settings';

/** Which half of the dock editor a row belongs to. */
export enum DockSection {
  DOCKED = 'docked',
  HIDDEN = 'hidden',
}

/**
 * Move one item to `index` within `section`, returning a new layout.
 *
 * Covers both gestures the editor supports with a single rule: remove the item
 * from wherever it is, then insert it at the requested position. Reordering
 * inside a section and crossing between sections are the same operation, which is
 * why dropping an item back onto its own slot is naturally a no-op instead of a
 * special case.
 *
 * Removing before inserting is what keeps the item from being duplicated when the
 * source and target sections are the same. The index is clamped, so a drop past
 * the last row appends rather than silently doing nothing.
 *
 * An id that is in neither section is left alone — it was dropped by
 * normalizeDockLayout (an id from another build), and inventing a position for it
 * would resurrect it.
 */
export function moveDockItem(
  layout: DockLayout,
  id: DockItemId,
  section: DockSection,
  index: number,
): DockLayout {
  if (!layout.docked.includes(id) && !layout.hidden.includes(id)) {
    return { docked: [...layout.docked], hidden: [...layout.hidden] };
  }

  const next: DockLayout = {
    docked: layout.docked.filter((entry) => entry !== id),
    hidden: layout.hidden.filter((entry) => entry !== id),
  };

  const target = next[section];
  target.splice(clamp(index, target.length), 0, id);
  return next;
}

/** Allow insertion at every slot including the end (hence `length`, not `length - 1`). */
function clamp(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.trunc(index), length);
}
