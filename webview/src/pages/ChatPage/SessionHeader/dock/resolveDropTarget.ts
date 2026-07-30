/** A measured row in the editor. */
export interface MeasuredRow {
  /** Row's index in the list. */
  index: number;
  /** Row's vertical midpoint in viewport coordinates. */
  middle: number;
}

/**
 * Decide where a dragged row lands (as an insertion index), given the pointer
 * position and the measured geometry of the editor's rows.
 *
 * Rows are compared against their own midpoints: the pointer inserts before
 * every row whose midpoint it has not yet passed. That is the usual
 * list-reorder rule, and it makes the drop position depend only on where the
 * pointer is — never on which direction the drag came from, so the same
 * position always yields the same result.
 */
export function resolveDropTarget(pointerY: number, rows: readonly MeasuredRow[]): number {
  const sorted = [...rows].sort((a, b) => a.index - b.index);
  const before = sorted.find((row) => pointerY < row.middle);
  return before ? before.index : sorted.length;
}
