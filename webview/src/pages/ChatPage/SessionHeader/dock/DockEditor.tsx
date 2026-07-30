import { Bars2Icon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { DockItemId } from '@/types/settings';
import { getDockItem } from './registry';
import { DockSection, moveDockItem } from './moveDockItem';
import { useDockLayout } from './useDockLayout';
import { useDockItemActions } from './useDockItemActions';
import { useReorderDrag } from './useReorderDrag';

interface Props {
  onRun: () => void;
}

/**
 * The ⋮ menu's entire body: a Notion-style two-section arrangement that is
 * ALSO how you run each item — there is no separate "normal" listing.
 *
 * Every item sits in exactly one of `docked` / `hidden`, dragged between and
 * within the sections by its handle. The row itself is a button: clicking
 * anywhere on it (not the handle) runs the item immediately, same as before.
 * The two never conflict because only the handle starts a drag — the rest of
 * the row is a plain click target — so there is no mode to switch into first.
 *
 * Items are listed even when their feature currently has nothing to show (no
 * reservations, signed out). Arranging the dock is a decision about where a
 * thing belongs when it does appear, so hiding the row would make it
 * impossible to place an icon before you need it.
 */
export function DockEditor(props: Props) {
  const { onRun } = props;
  const { t } = useTranslation('chat');
  const { layout, save } = useDockLayout();
  const actions = useDockItemActions();

  const { drag, registerRow, registerSection, setLayout, handlePointerDown } = useReorderDrag({
    onDrop: (id, section, index) => save(moveDockItem(layout, id, section, index)),
  });
  // The drag hook measures against the layout as currently rendered.
  setLayout(layout);

  return (
    <div className="py-1">
      {renderSection(DockSection.DOCKED, layout.docked)}
      {renderSection(DockSection.HIDDEN, layout.hidden)}
    </div>
  );

  function renderSection(section: DockSection, ids: DockItemId[]) {
    const target = drag?.target?.section === section ? drag.target.index : null;

    return (
      <div
        ref={(el) => registerSection(section, el)}
        className="border-t border-border-default first:border-t-0 pt-1 mt-1 first:mt-0 first:pt-0"
      >
        <p className="px-3 py-1 text-[0.7077rem] font-semibold text-text-tertiary uppercase tracking-wide">
          {t(`sessionHeader.dock.sections.${section}`)}
        </p>

        {/* An empty section still needs height, or there would be nothing to drop onto. */}
        <div className="min-h-[1.75rem]">
          {ids.map((id, index) => {
            const item = getDockItem(id);
            if (!item) return null;
            const isDragging = drag?.id === id;
            const run = actions[id];

            return (
              <div key={id}>
                {target === index && <InsertionLine />}
                <div
                  ref={(el) => registerRow(id, el)}
                  className={`flex items-center gap-1 transition-colors ${
                    isDragging ? 'opacity-40' : 'hover:bg-surface-hover'
                  }`}
                >
                  {/* Only the handle starts a drag — the row underneath stays a
                      plain click target, so running an item and reordering it
                      never compete for the same gesture. */}
                  <span
                    onPointerDown={(e) => handlePointerDown(e, id, section, index)}
                    className="pl-3 py-1.5 cursor-grab select-none text-text-tertiary"
                    title={t('sessionHeader.dock.dragHint')}
                  >
                    <Bars2Icon className="w-4 h-4 shrink-0" />
                  </span>
                  <button
                    onClick={() => {
                      onRun();
                      run?.();
                    }}
                    className="flex-1 min-w-0 flex items-center gap-2 pr-3 py-1.5 text-start"
                  >
                    <item.icon className="w-4 h-4 shrink-0 text-text-secondary" />
                    <span className="flex-1 min-w-0 truncate text-[0.8461rem] text-text-primary">
                      {t(item.labelKey)}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
          {target === ids.length && <InsertionLine />}
        </div>
      </div>
    );
  }
}

/** Where the dragged row would land on release. */
function InsertionLine() {
  return <div className="mx-3 my-0.5 h-0.5 rounded bg-text-link" />;
}
