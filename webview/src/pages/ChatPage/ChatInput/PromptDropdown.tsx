import { useEffect, useRef } from 'react';
import { DragDropProvider, useDraggable, useDragOperation, useDroppable, type DragEndEvent } from '@dnd-kit/react';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import type { ScopedPrompt } from '@/types/prompt';
import type { CategorySelection } from '@/utils/promptCategories';
import {
  CATEGORY_DROP_TYPE,
  PROMPT_DRAG_TYPE,
  acceptsDrop,
  categoriesAfterDrop,
  readCategoryDrop,
  readPromptDrag,
} from '@/utils/promptDrag';
import type { PanelCategoryRow, PromptPane, PromptRow } from './hooks/usePromptLibrary';

interface Props {
  rows: PromptRow[];
  selectedIndex: number;
  isLoading: boolean;
  /** True once a load has resolved, so "no prompts yet" is only shown when true. */
  hasLoaded: boolean;
  /** The category column's rows. Empty when the user has made no categories. */
  categoryRows: PanelCategoryRow[];
  selectedCategory: CategorySelection;
  /** Which column the arrow keys are walking, so the right one can say so. */
  focusedPane: PromptPane;
  onSelectCategory: (key: CategorySelection) => void;
  /** File a dragged prompt under the category it was dropped on. */
  onFilePrompt: (prompt: ScopedPrompt, categoryIds: string[]) => void;
  onSelect: (index: number) => void;
  /** Open this prompt's edit screen in the library, without leaving the composer. */
  onEdit: (prompt: ScopedPrompt) => void;
  /** Remove this prompt, after asking. */
  onDelete: (prompt: ScopedPrompt) => void;
  onClose: () => void;
}

/** A one-line preview of the prompt's text, for the row under its name. */
const PREVIEW_MAX_LENGTH = 80;

function preview(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  return oneLine.length > PREVIEW_MAX_LENGTH
    ? `${oneLine.slice(0, PREVIEW_MAX_LENGTH)}…`
    : oneLine;
}

/**
 * The prompt library panel, opened by `!!` in the composer.
 *
 * The chrome deliberately matches {@link MentionDropdown} — the sibling that
 * shares this slot — rather than inventing its own height cap and scroll
 * behaviour. Two panels opening in the same place at different sizes reads as a
 * defect on its own (issue #314).
 *
 * A user who files their prompts under categories gets a second column here,
 * the same split and the same two shapes the library modal uses, so the two
 * screens are one screen learned once. A user who files nothing gets the panel
 * exactly as it was.
 */
export function PromptDropdown(props: Props) {
  const {
    rows,
    selectedIndex,
    isLoading,
    hasLoaded,
    categoryRows,
    selectedCategory,
    focusedPane,
    onSelectCategory,
    onFilePrompt,
    onSelect,
    onEdit,
    onDelete,
    onClose,
  } = props;
  const { t } = useTranslation('chat');
  // The category wording belongs to the library, and must read the same here.
  const { t: tCommon } = useTranslation('common');

  const listRef = useRef<HTMLUListElement>(null);
  const categoryListRef = useRef<HTMLDivElement>(null);

  // Keep the selected row visible once the list scrolls.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // The same for the category column, which scrolls sideways when narrow: the
  // arrows can walk it past its own edge just as easily as they can the list.
  useEffect(() => {
    const selected = categoryListRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedCategory]);

  const promptRowCount = rows.filter(row => row.kind === 'prompt').length;
  const hasCategories = categoryRows.length > 0;

  /**
   * File a prompt by dropping it on a category chip.
   *
   * `categoriesAfterDrop` decides what the drop means, and the library modal
   * asks the same function, so the gesture means the same thing on both
   * screens. A null answer means nothing would change and no write happens.
   */
  const handleDrop = (event: DragEndEvent) => {
    if (event.canceled) return;
    const dragged = readPromptDrag(event.operation.source?.data);
    const onto = readCategoryDrop(event.operation.target?.data);
    if (!dragged || !onto) return;
    const next = categoriesAfterDrop(dragged.categories, onto.key);
    if (next === null) return;
    const row = rows.find((r) => r.kind === 'prompt' && r.prompt.id === dragged.promptId);
    if (row?.kind === 'prompt') onFilePrompt(row.prompt, next);
  };

  return (
    <DragDropProvider onDragEnd={handleDrop}>
    <div className="w-full bg-surface-overlay border border-border-default rounded-md shadow-lg overflow-hidden">
      {isLoading && promptRowCount === 0 ? (
        <div className="px-3 py-2 text-xs text-text-tertiary">
          {t('chatInput.promptDropdown.loading')}
        </div>
      ) : (
          <div className="flex flex-col sm:flex-row">
            {hasCategories && (
              /* Two shapes, the same two the library modal takes: a column
                 beside the list when there is room for two, and a strip above
                 it scrolling sideways when there is not. Capped in height
                 either way, so twenty categories never push the prompts out of
                 a panel that is already only 200px tall. */
              <div
                ref={categoryListRef}
                className="flex max-h-14 shrink-0 flex-row gap-1 overflow-x-auto overflow-y-hidden border-b border-border-subtle p-1.5 sm:max-h-[200px] sm:w-32 sm:min-w-24 sm:max-w-40 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-e"
              >
                {categoryRows.map((row) => (
                  <PanelCategoryChip
                    key={row.key}
                    row={row}
                    label={row.category?.name ?? tCommon('promptLibrary.allCategories')}
                    isSelected={row.key === selectedCategory}
                    isFocusedPane={focusedPane === 'categories'}
                    onSelect={onSelectCategory}
                  />
                ))}
              </div>
            )}

            {/* The empty notice belongs to the list, not to the panel: it is the
                picked category that has nothing in it, and saying so across both
                columns would read as if the whole library were empty. */}
            <div className="min-w-0 flex-1 overflow-y-auto max-h-[200px]">
            {hasLoaded && promptRowCount === 0 && (
              <div className="px-3 py-2 text-xs text-text-tertiary">
                {t('chatInput.promptDropdown.noPrompts')}
              </div>
            )}
            <ul ref={listRef}>
              {rows.map((row, index) => (
                <li key={row.kind === 'prompt' ? row.prompt.id : 'create'}>
                  {row.kind === 'create' ? (
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-start text-xs ${
                        index === selectedIndex
                          ? 'bg-surface-selected text-text-primary'
                          : 'text-text-secondary hover:bg-surface-selected/60'
                      } ${
                        index === selectedIndex && hasCategories && focusedPane === 'prompts'
                          ? 'ring-1 ring-inset ring-border-focus'
                          : ''
                      }`}
                      onMouseDown={(e) => {
                        // mousedown, not click: the composer's blur must not fire first.
                        e.preventDefault();
                        onSelect(index);
                      }}
                    >
                      <span className="flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </span>
                      <span className="truncate">{t('chatInput.promptDropdown.createPrompt')}</span>
                    </button>
                  ) : (
                    <PanelPromptRow
                      prompt={row.prompt}
                      isSelected={index === selectedIndex}
                      isRinged={index === selectedIndex && hasCategories && focusedPane === 'prompts'}
                      onSelect={() => onSelect(index)}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  )}
                </li>
              ))}
            </ul>
            </div>
          </div>
      )}
      <button
        type="button"
        className="sr-only"
        onClick={onClose}
        aria-label={t('chatInput.promptDropdown.closeAriaLabel')}
      />
    </div>
    </DragDropProvider>
  );
}

interface PanelCategoryChipProps {
  row: PanelCategoryRow;
  label: string;
  isSelected: boolean;
  isFocusedPane: boolean;
  onSelect: (key: CategorySelection) => void;
}

/**
 * One category chip, which is also somewhere a prompt can be dropped.
 *
 * A component of its own because each chip registers its own drop target and
 * hooks cannot be called in a loop. It lights up only when the drop would
 * actually change something, so "All" and the category a prompt already carries
 * stay dim rather than promising a write that never happens.
 */
function PanelCategoryChip(props: PanelCategoryChipProps) {
  const { row, label, isSelected, isFocusedPane, onSelect } = props;

  const { ref: dropRef, isDropTarget } = useDroppable({
    id: `panel-category-drop:${row.key}`,
    type: CATEGORY_DROP_TYPE,
    accept: PROMPT_DRAG_TYPE,
    data: { key: row.key },
  });
  const { source } = useDragOperation();
  const dragged = readPromptDrag(source?.data);
  const wouldAccept = dragged !== null && acceptsDrop(dragged.categories, row.key);

  return (
    <button
      ref={dropRef}
      type="button"
      aria-pressed={isSelected}
      title={label}
      onMouseDown={(e) => {
        // mousedown, not click: the composer's blur must not fire first.
        e.preventDefault();
        onSelect(row.key);
      }}
      className={`flex w-auto max-w-32 flex-shrink-0 items-center gap-1 rounded px-2 py-1 text-start text-xs transition-colors sm:w-full sm:max-w-none ${
        isSelected
          ? 'bg-surface-selected text-text-primary'
          : 'text-text-secondary hover:bg-surface-selected/60'
      } ${
        // Which column the arrows are walking. Without it both columns show a
        // highlight and neither says which one Up and Down would move.
        isSelected && isFocusedPane ? 'ring-1 ring-border-focus' : ''
      } ${isDropTarget && wouldAccept ? 'ring-1 ring-accent-primary bg-accent-primary/10' : ''} ${
        dragged !== null && !wouldAccept ? 'opacity-40' : ''
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="flex-shrink-0 text-text-tertiary">({row.count})</span>
    </button>
  );
}

interface PanelPromptRowProps {
  prompt: ScopedPrompt;
  isSelected: boolean;
  isRinged: boolean;
  onSelect: () => void;
  onEdit: (prompt: ScopedPrompt) => void;
  onDelete: (prompt: ScopedPrompt) => void;
}

/**
 * One prompt row, which can also be dragged onto a category chip.
 *
 * The row is a <div> holding a drag handle and a button, rather than one big
 * button: the bookmark had to become a grab handle, and a handle nested inside
 * the button that pastes the prompt would fire the paste on the way down. The
 * split also lets edit and delete be real <button>s instead of spans wearing a
 * button role.
 */
function PanelPromptRow(props: PanelPromptRowProps) {
  const { prompt, isSelected, isRinged, onSelect, onEdit, onDelete } = props;
  const { t } = useTranslation('chat');
  const { t: tCommon } = useTranslation('common');

  const { ref: dragRef, isDragging } = useDraggable({
    id: `panel-prompt-drag:${prompt.scope}:${prompt.id}`,
    type: PROMPT_DRAG_TYPE,
    data: { promptId: prompt.id, scope: prompt.scope, categories: prompt.categories ?? [] },
  });

  return (
    <div
      className={`group/row flex w-full items-center gap-2 px-3 py-1.5 text-xs ${
        isSelected
          ? 'bg-surface-selected text-text-primary'
          : 'text-text-secondary hover:bg-surface-selected/60'
      } ${isRinged ? 'ring-1 ring-inset ring-border-focus' : ''} ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      {/* The bookmark is the grab handle. `mousedown` is swallowed here so the
          row's own paste does not fire the moment the drag begins; dnd-kit
          listens for `pointerdown`, which is a different event and still
          arrives. */}
      <span
        ref={dragRef}
        title={tCommon('promptLibrary.dragToCategory')}
        aria-label={tCommon('promptLibrary.dragToCategory')}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="flex-shrink-0 cursor-grab text-current active:cursor-grabbing"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </span>

      <button
        type="button"
        onMouseDown={(e) => {
          // mousedown, not click: the composer's blur must not fire first.
          e.preventDefault();
          onSelect();
        }}
        className="flex min-w-0 flex-1 items-center gap-2 text-start"
      >
        {/* The name gets a quarter of the row and the content gets the rest.
            The name is only there to tell the prompts apart at a glance; the
            content is the thing the user is about to paste, so it is the one
            that needs the room. (They used to split the row evenly.)

            The name also carries the hierarchy by WEIGHT, so the preview and
            scope beside it can stay readable instead of being dimmed into the
            background. They were on `text-disabled` (82/255 in dark), the
            dimmest token we have, and could not be read at a glance. */}
        <span className="truncate w-1/4 flex-shrink-0 font-medium">{prompt.name}</span>
        {/* Hovering the preview shows the whole prompt, line breaks and all:
            one truncated line cannot tell the user what they are about to
            paste. */}
        <Tooltip content={prompt.content}>
          <span className="truncate text-text-tertiary flex-1 hidden sm:inline">
            {preview(prompt.content)}
          </span>
        </Tooltip>
      </button>

      {/* The scope label and the two actions share one slot: the label says
          where the prompt lives, which matters while reading the list, and the
          actions matter only once the pointer has settled on a row. Swapping
          them keeps the row one line wide either way. */}
      <span className="relative flex-shrink-0 text-text-tertiary">
        <span className="group-hover/row:invisible">
          {prompt.scope === 'project'
            ? t('chatInput.promptDropdown.scopeProject')
            : t('chatInput.promptDropdown.scopeGlobal')}
        </span>
        <span className="absolute inset-y-0 end-0 hidden items-center gap-0.5 group-hover/row:flex">
          <button
            type="button"
            title={t('chatInput.promptDropdown.editPrompt')}
            aria-label={t('chatInput.promptDropdown.editPrompt')}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(prompt);
            }}
            className="rounded p-0.5 text-text-tertiary transition-colors hover:text-text-primary"
          >
            <PencilSquareIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t('chatInput.promptDropdown.deletePrompt')}
            aria-label={t('chatInput.promptDropdown.deletePrompt')}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(prompt);
            }}
            className="rounded p-0.5 text-text-tertiary transition-colors hover:text-state-error-fg"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      </span>
    </div>
  );
}
