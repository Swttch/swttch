import { getDockItem } from './registry';
import { useDockLayout } from './useDockLayout';

/**
 * The icons the user chose to keep outside the ⋮ menu, in their chosen order.
 *
 * Each item renders its own `DockView`, which owns its live state and may render
 * nothing at all — no reservations, not signed in, no usage data yet. That keeps
 * the existing behaviour where an icon simply is not there until it has something
 * to say, and it is why this component holds no per-item logic.
 */
export function Dock() {
  const { layout } = useDockLayout();
  const visible = new Set(layout.visible);

  return (
    <>
      {layout.order
        .filter((id) => visible.has(id))
        .map((id) => {
          const item = getDockItem(id);
          if (!item) return null;
          return <item.DockView key={id} />;
        })}
    </>
  );
}
