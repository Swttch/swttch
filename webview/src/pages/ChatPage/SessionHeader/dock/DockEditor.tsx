import { Bars2Icon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { getDockItem } from './registry';
import { moveDockItem } from './moveDockItem';
import { toggleDockVisible } from './toggleDockVisible';
import { useDockLayout } from './useDockLayout';
import { useDockItemActions } from './useDockItemActions';
import { useReorderDrag } from './useReorderDrag';
import { DockItemStatus } from './DockItemStatus';

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
 */
export function DockEditor(props: Props) {
  const { onRun } = props;
  const { t } = useTranslation('chat');
  const { layout, save } = useDockLayout();
  const actions = useDockItemActions();
  const visible = new Set(layout.visible);

  const { drag, registerRow, setOrder, handlePointerDown } = useReorderDrag({
    onDrop: (id, index) => save(moveDockItem(layout, id, index)),
  });
  // The drag hook measures against the order as currently rendered.
  setOrder(layout.order);

  return (
    <div className="py-1">
      {layout.order.map((id, index) => {
        const item = getDockItem(id);
        if (!item) return null;
        const isDragging = drag?.id === id;
        const isVisible = visible.has(id);
        const run = actions[id];

        return (
          <div key={id}>
            {drag?.target === index && <InsertionLine />}
            <div
              className={`flex items-center gap-1 transition-colors ${
                isDragging ? 'opacity-40' : 'hover:bg-surface-hover'
              }`}
            >
              {/* Only the handle starts a drag — the row underneath stays a
                  plain click target, so running an item and reordering it
                  never compete for the same gesture. */}
              <span
                onPointerDown={(e) => handlePointerDown(e, id)}
                className="pl-3 py-1.5 cursor-grab select-none text-text-tertiary"
                title={t('sessionHeader.dock.dragHint')}
              >
                <Bars2Icon className="w-4 h-4 shrink-0" />
              </span>
              <button
                ref={(el) => registerRow(id, el)}
                onClick={() => {
                  onRun();
                  run?.();
                }}
                className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-start"
              >
                <DockItemStatus id={id} icon={item.icon} labelKey={item.labelKey} />
              </button>
              <button
                onClick={() => save(toggleDockVisible(layout, id))}
                title={t(isVisible ? 'sessionHeader.dock.hideFromDock' : 'sessionHeader.dock.showInDock')}
                className="pr-3 py-1.5 text-text-tertiary hover:text-text-primary transition-colors"
              >
                {isVisible ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        );
      })}
      {drag?.target === layout.order.length && <InsertionLine />}
    </div>
  );
}

/** Where the dragged row would land on release. */
function InsertionLine() {
  return <div className="mx-3 my-0.5 h-0.5 rounded bg-text-link" />;
}
