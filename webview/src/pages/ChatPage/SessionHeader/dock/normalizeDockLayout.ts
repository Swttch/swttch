import { DockItemId, type DockLayout } from '@/types/settings';

/** Declaration order of {@link DockItemId} — the fallback order for unplaced items. */
const ALL_IDS = Object.values(DockItemId);
const KNOWN_IDS = new Set<string>(ALL_IDS);

/**
 * Turn a persisted (or absent, or hand-edited) dock layout into one the UI can
 * render without further guarding: `order` contains every known item exactly
 * once, and `visible` names a subset of `order`.
 *
 * Repairs, each guarding a real failure:
 * - **Items missing from `order` are appended**, in declaration order, and start
 *   NOT visible. A newly shipped item is absent from every layout saved before
 *   it existed; without this it would be unreachable from the ⋮ menu.
 * - **Unknown ids are dropped** from both lists. They come from a newer/older
 *   build or a hand-edited settings file and have no component to render.
 * - **Duplicates in `order` keep their first occurrence** — a repeated id would
 *   leave two rows claiming the same position.
 * - **A `visible` id absent from `order` is dropped.** `visible` only makes sense
 *   as a subset of `order`; an id with no position to render at is discarded
 *   rather than trusted.
 *
 * A layout with both arrays empty means "not configured yet" and normalizes to
 * every item in declaration order, none visible — a fresh install shows only ⋮.
 */
export function normalizeDockLayout(layout: DockLayout | null | undefined): DockLayout {
  const order = takeKnownIds(layout?.order).ids;
  const placed = new Set(order);
  for (const id of ALL_IDS) {
    if (!placed.has(id)) order.push(id);
  }

  const orderSet = new Set(order);
  const visible = takeKnownIds(layout?.visible).ids.filter((id) => orderSet.has(id));

  return { order, visible };
}

/** Collect the recognized, not-yet-seen ids from a list, preserving order. */
function takeKnownIds(list: unknown): { ids: DockItemId[] } {
  const seen = new Set<string>();
  const ids: DockItemId[] = [];
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (typeof entry !== 'string' || !KNOWN_IDS.has(entry) || seen.has(entry)) continue;
      seen.add(entry);
      ids.push(entry as DockItemId);
    }
  }
  return { ids };
}
