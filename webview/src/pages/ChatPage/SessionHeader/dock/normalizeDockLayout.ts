import { DockItemId, type DockLayout } from '@/types/settings';

/** Declaration order of {@link DockItemId} — the fallback order for unplaced items. */
const ALL_IDS = Object.values(DockItemId);
const KNOWN_IDS = new Set<string>(ALL_IDS);

/**
 * Turn a persisted (or absent, or hand-edited) dock layout into one the UI can
 * render without further guarding: every known item appears exactly once, across
 * `docked` and `hidden` combined.
 *
 * Three repairs, each guarding a real failure:
 * - **Unplaced items are appended to `hidden`.** A newly shipped item is absent
 *   from every layout saved before it existed; without this it would be
 *   unreachable from the ⋮ menu until the user reset their settings.
 * - **Unknown ids are dropped.** They come from a newer build or a hand-edited
 *   settings file and have no component to render.
 * - **Duplicates keep their first occurrence.** Two copies of one icon would make
 *   a drag ambiguous about which one moved. The backend already rejects these on
 *   write, so this only catches files edited by hand.
 *
 * A layout with both sections empty means "not configured yet" and normalizes to
 * everything hidden — a fresh install shows only the ⋮ button.
 */
export function normalizeDockLayout(layout: DockLayout | null | undefined): DockLayout {
  const docked = takeKnownIds(layout?.docked);
  // `docked` wins a tie: an id in both sections stays visible rather than
  // silently vanishing from the dock the user arranged.
  const hidden = takeKnownIds(layout?.hidden, docked.seen);

  const placed = hidden.seen;
  const unplaced = ALL_IDS.filter((id) => !placed.has(id));

  return { docked: docked.ids, hidden: [...hidden.ids, ...unplaced] };
}

/**
 * Collect the recognized, not-yet-seen ids from one section, preserving order.
 * `seen` accumulates across calls so the second section cannot repeat the first.
 */
function takeKnownIds(
  section: unknown,
  seen: Set<string> = new Set(),
): { ids: DockItemId[]; seen: Set<string> } {
  const ids: DockItemId[] = [];
  if (Array.isArray(section)) {
    for (const entry of section) {
      if (typeof entry !== 'string' || !KNOWN_IDS.has(entry) || seen.has(entry)) continue;
      seen.add(entry);
      ids.push(entry as DockItemId);
    }
  }
  return { ids, seen };
}
