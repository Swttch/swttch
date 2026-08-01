import { useRef } from 'react';
import { useSortable } from '@dnd-kit/react/sortable';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/solid';
import { useTranslation } from '@/i18n';
import type { DockItemId } from '@/types/settings';
import type { DockItemDef } from './registry';
import { DragHandleIcon } from './DragHandleIcon';
import { DockItemStatus } from './DockItemStatus';

interface Props {
  item: DockItemDef;
  index: number;
  isVisible: boolean;
  onRun: () => void;
  onToggleVisible: (id: DockItemId) => void;
}

/**
 * One row of the ⋮ menu: drag handle, the item itself (click to run), and the
 * eye that docks or undocks it.
 *
 * Its own component because `useSortable` is one hook per sortable row, and a
 * hook cannot be called in a loop.
 *
 * The three gestures never compete: `handleRef` limits dragging to the handle,
 * so the button beside it stays an ordinary click target. Without that, pressing
 * a row to run it would start a drag instead.
 */
export function DockEditorRow(props: Props) {
  const { item, index, isVisible, onRun, onToggleVisible } = props;
  const { t } = useTranslation('chat');
  const handle = useRef<HTMLButtonElement>(null);

  const { ref, isDragging } = useSortable({
    id: item.id,
    index,
    handle,
  });

  return (
    <div
      ref={ref}
      // Identifies the row independently of its markup, so a test can reach a
      // specific item's controls without encoding how the row is laid out.
      data-dock-item={item.id}
      // `relative` + a z-index while dragging keeps the lifted row above its
      // neighbours as they slide past it, instead of being painted underneath.
      className={`relative flex items-center gap-1 ${
        isDragging ? 'z-10 opacity-80' : 'hover:bg-surface-hover'
      }`}
    >
      {/* A real <button>, not a <span>: the drag layer's keyboard sensor only
          reaches a handle that can take focus, so this is what makes Space to
          pick up, arrows to move, Space to drop work at all. `type="button"`
          keeps it from submitting anything.

          Padding is logical (ps-/pe-), never physical (pl-/pr-): the app mirrors
          its whole layout for Arabic and Persian, and physical padding would
          leave the handle hugging the wrong edge there. */}
      <div className="ps-0.5 pe-0">
        <button
            type="button"
            ref={handle}
            className="px-0.5 py-1.5 rounded cursor-grab select-none text-text-tertiary/60 hover:text-text-primary hover:bg-surface-pressed"
            title={t('sessionHeader.dock.dragHint')}
        >
          {/* Height only — the 10×16 viewBox sets the width, so forcing a square
            (w-4 h-4) would stretch the dots apart. */}
          <DragHandleIcon className="h-3.5 shrink-0" />
        </button>
      </div>

      <button
        onClick={onRun}
        className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-start"
      >
        <DockItemStatus id={item.id} icon={item.icon} labelKey={item.labelKey} />
      </button>
      <button
        onClick={() => onToggleVisible(item.id)}
        title={t(isVisible ? 'sessionHeader.dock.hideFromDock' : 'sessionHeader.dock.showInDock')}
        className={`ps-1 pe-2 py-1.5 ${
          isVisible ? 'text-text-primary' : 'text-text-tertiary/60 hover:text-text-primary'
        } transition-colors`}
      >
        {isVisible ? <EyeIcon className="w-3.5 h-3.5" /> : <EyeSlashIcon className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
