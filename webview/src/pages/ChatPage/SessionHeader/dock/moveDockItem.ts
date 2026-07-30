import type { DockItemId, DockLayout } from '@/types/settings';

/**
 * Move one item to `index` in the single order list, returning a new layout.
 * `visible` is untouched — reordering never changes which items are docked.
 *
 * Removes the item from wherever it sits, then reinserts it at the requested
 * position. Removing first is what keeps a drop onto the item's own slot a
 * no-op instead of a special case, and what prevents duplication. The index is
 * clamped, so a drop past the last row appends rather than doing nothing.
 *
 * An id `order` does not contain is left alone — it was dropped by
 * normalizeDockLayout (an id from another build), and inventing a position for
 * it would resurrect it.
 */
export function moveDockItem(layout: DockLayout, id: DockItemId, index: number): DockLayout {
  if (!layout.order.includes(id)) {
    return { order: [...layout.order], visible: [...layout.visible] };
  }

  const order = layout.order.filter((entry) => entry !== id);
  order.splice(clamp(index, order.length), 0, id);
  return { order, visible: [...layout.visible] };
}

/** Allow insertion at every slot including the end (hence `length`, not `length - 1`). */
function clamp(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.trunc(index), length);
}
