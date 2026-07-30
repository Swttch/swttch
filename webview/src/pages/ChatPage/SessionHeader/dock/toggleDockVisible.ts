import type { DockItemId, DockLayout } from '@/types/settings';

/**
 * Flip whether one item is pulled out into the dock. `order` is untouched —
 * toggling visibility never reorders anything, matching the eye-icon toggle in
 * Notion's show/hide-properties panel this editor is modelled on.
 */
export function toggleDockVisible(layout: DockLayout, id: DockItemId): DockLayout {
  const visible = layout.visible.includes(id)
    ? layout.visible.filter((entry) => entry !== id)
    : [...layout.visible, id];
  return { order: [...layout.order], visible };
}
