import { useState } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';
import type { DockItemId } from '@/types/settings';
import { getDockItem } from './registry';
import { toggleDockVisible } from './toggleDockVisible';
import { useDockLayout } from './useDockLayout';
import { useDockItemActions } from './useDockItemActions';
import { DockEditorRow } from './DockEditorRow';

interface Props {
  onRun: () => void;
}

/**
 * The ⋮ menu's entire body: a single ordered list, each row toggled into or out
 * of the dock with an eye icon — the same interaction Notion uses to show/hide
 * table properties, chosen over a two-section drag-between-lists layout because
 * an empty "In the dock" section (the common case right after this menu ships)
 * read as broken rather than empty.
 *
 * The list is ALSO how you run each item — there is no separate mode to switch
 * into first. Clicking anywhere on a row except its drag handle or its eye
 * toggle runs the item immediately, same as its icon always did. Reordering
 * only starts from the handle, and only the eye changes what's docked, so the
 * three gestures never compete for the same touch.
 *
 * Items are listed even when their feature currently has nothing to show (no
 * reservations). Deciding where something belongs, or whether to dock it, has
 * to be possible before it has anything to show.
 *
 * Reordering is dnd-kit's rather than hand-rolled, for what a bespoke pointer
 * handler would have to earn one at a time: neighbours that slide out of the way
 * as you drag, keyboard reordering, and screen-reader announcements. It is
 * pointer-event based, which matters here — this webview also runs inside JCEF,
 * where HTML5 drag-and-drop's `dataTransfer` proved unreliable enough that
 * native file drops had to be routed around it entirely.
 */
export function DockEditor(props: Props) {
  const { onRun } = props;
  const { layout, save } = useDockLayout();
  const actions = useDockItemActions();
  const visible = new Set(layout.visible);

  // The order being previewed mid-drag. Null when no drag is in progress, which
  // is what makes cancelling work: the saved layout is never touched until the
  // drop lands, so dropping the preview restores the original order for free.
  // Writing each intermediate order straight to settings instead would leave a
  // cancelled drag permanently applied — there would be nothing left to restore.
  const [preview, setPreview] = useState<DockItemId[] | null>(null);
  const order = preview ?? layout.order;

  const runItem = (id: DockItemId) => {
    onRun();
    actions[id]?.();
  };

  return (
    // onDragOver previews the reorder so neighbours animate; onDragEnd persists
    // it. A cancelled drag (Esc, lost pointer) reports `canceled` and only clears
    // the preview.
    <DragDropProvider
      onDragOver={(event) => setPreview((current) => move(current ?? layout.order, event))}
      onDragEnd={(event) => {
        setPreview(null);
        if (event.canceled) return;
        save({ ...layout, order: move(order, event) });
      }}
    >
      <div className="py-1">
        {order.map((id, index) => {
          const item = getDockItem(id);
          if (!item) return null;

          return (
            <DockEditorRow
              key={id}
              item={item}
              index={index}
              isVisible={visible.has(id)}
              onRun={() => runItem(id)}
              onToggleVisible={(target) => save(toggleDockVisible(layout, target))}
            />
          );
        })}
      </div>
    </DragDropProvider>
  );
}
