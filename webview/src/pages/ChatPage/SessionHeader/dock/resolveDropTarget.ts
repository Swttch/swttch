import { DockSection } from './moveDockItem';

/** A measured row in the editor: which section it sits in and where it is on screen. */
export interface MeasuredRow {
  section: DockSection;
  /** Row's vertical midpoint in viewport coordinates. */
  middle: number;
  /** Row's index within its own section. */
  index: number;
}

/** A measured section container, used when a section has no rows to aim at. */
export interface MeasuredSection {
  section: DockSection;
  top: number;
  bottom: number;
}

export interface DropTarget {
  section: DockSection;
  index: number;
}

/**
 * Decide where a dragged row lands, given the pointer position and the measured
 * geometry of the editor.
 *
 * Rows are compared against their own midpoints: the pointer inserts before every
 * row whose midpoint it has not yet passed. That is the usual list-reorder rule,
 * and it makes the drop position depend only on where the pointer is — never on
 * which direction the drag came from, so the same position always yields the same
 * result.
 *
 * The empty-section case is why sections are measured too. With "docked" empty
 * there is no row to aim at, and without a container to fall back on the user
 * could never populate an empty dock — the whole point of the editor.
 */
export function resolveDropTarget(
  pointerY: number,
  rows: readonly MeasuredRow[],
  sections: readonly MeasuredSection[],
): DropTarget | null {
  const container = sections.find((s) => pointerY >= s.top && pointerY <= s.bottom);

  // Inside a section: position among that section's own rows.
  if (container) {
    const own = rows
      .filter((row) => row.section === container.section)
      .sort((a, b) => a.index - b.index);
    const before = own.find((row) => pointerY < row.middle);
    return { section: container.section, index: before ? before.index : own.length };
  }

  // Outside every section (dragged past the edges): clamp to the nearest one so
  // the gesture still resolves rather than being silently discarded.
  if (sections.length === 0) return null;
  const nearest = sections.reduce((best, s) => {
    const d = pointerY < s.top ? s.top - pointerY : pointerY - s.bottom;
    const bestD = pointerY < best.top ? best.top - pointerY : pointerY - best.bottom;
    return d < bestD ? s : best;
  });
  const own = rows.filter((row) => row.section === nearest.section);
  return { section: nearest.section, index: pointerY < nearest.top ? 0 : own.length };
}
