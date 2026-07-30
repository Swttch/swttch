import { Bars2Icon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { DockItemId } from '@/types/settings';
import { getDockItem } from './registry';
import { DockSection, moveDockItem } from './moveDockItem';
import { useDockLayout } from './useDockLayout';
import { useReorderDrag } from './useReorderDrag';

/**
 * The Notion-style arrangement editor: two sections, every item in exactly one of
 * them, dragged between and within them.
 *
 * Unlike the menu's normal mode, an item appears once and only once here —
 * showing a docked item in both lists would leave no unambiguous place to drop it.
 *
 * Items are listed even when their feature currently has nothing to show (no
 * reservations, signed out). Arranging the dock is a decision about where a thing
 * belongs when it does appear, so hiding the row would make it impossible to
 * place an icon before you need it.
 */
export function DockEditor() {
  const { t } = useTranslation('chat');
  const { layout, save } = useDockLayout();

  const { drag, registerRow, registerSection, setLayout, handlePointerDown } = useReorderDrag({
    onDrop: (id, section, index) => save(moveDockItem(layout, id, section, index)),
  });
  // The drag hook measures against the layout as currently rendered.
  setLayout(layout);

  return (
    <div className="py-1">
      <p className="px-3 pb-1 text-[0.7077rem] text-text-tertiary">{t('sessionHeader.dock.dragHint')}</p>
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
            return (
              <div key={id}>
                {target === index && <InsertionLine />}
                <div
                  ref={(el) => registerRow(id, el)}
                  onPointerDown={(e) => handlePointerDown(e, id, section, index)}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-grab select-none transition-colors ${
                    isDragging ? 'opacity-40' : 'hover:bg-surface-hover'
                  }`}
                >
                  <Bars2Icon className="w-4 h-4 shrink-0 text-text-tertiary" />
                  <item.icon className="w-4 h-4 shrink-0 text-text-secondary" />
                  <span className="text-[0.8461rem] text-text-primary truncate">{t(item.labelKey)}</span>
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
