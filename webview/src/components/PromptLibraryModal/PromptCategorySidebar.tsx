import { useEffect, useRef, useState } from 'react';
import { PlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { ALL_CATEGORIES, UNCATEGORISED, type CategorySelection } from '@/utils/promptCategories';
import type { PromptCategory } from '@/types/prompt';

/** One row of the sidebar: the two fixed ones, or a category. */
export interface SidebarRow {
  /** The value this row selects: a category id, or one of the two sentinels. */
  key: CategorySelection;
  label: string;
  count: number;
  /** Absent on the two fixed rows, which are not the user's to rename or remove. */
  category?: PromptCategory;
}

/**
 * The rows in the order they are drawn, which is also the order the arrows walk.
 *
 * "All" leads because it is where the screen opens and what the user returns to.
 * "Uncategorised" trails because it is where a prompt sits when nobody has
 * decided yet, which makes it the least interesting place to look. It is left
 * out entirely when nothing is filed under it, so a tidy library has no row
 * telling it so.
 */
export function buildSidebarRows(
  categories: PromptCategory[],
  counts: { all: number; uncategorised: number; byId: Map<string, number> },
  labels: { all: string; uncategorised: string },
): SidebarRow[] {
  return [
    { key: ALL_CATEGORIES, label: labels.all, count: counts.all },
    ...categories.map((category) => ({
      key: category.id,
      label: category.name,
      count: counts.byId.get(category.id) ?? 0,
      category,
    })),
    ...(counts.uncategorised > 0
      ? [{ key: UNCATEGORISED, label: labels.uncategorised, count: counts.uncategorised }]
      : []),
  ];
}

interface Props {
  rows: SidebarRow[];
  selected: CategorySelection;
  /**
   * True while the arrow keys are walking this column rather than the lists.
   *
   * Both columns hold a selection at once, so the selection alone cannot say
   * which one Up and Down would move. The `!!` panel answers this with a ring
   * on the focused column's selected row, and this is the same answer.
   */
  isFocusedPane: boolean;
  onSelect: (key: CategorySelection) => void;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (category: PromptCategory) => void;
  /** Set while a name is being typed, so the arrow keys leave the caret alone. */
  onEditingChange?: (editing: boolean) => void;
}

/**
 * The category picker beside the prompt lists.
 *
 * It takes two shapes, the same two the workflow agent picker takes (issue
 * #425), because it has the same problem: a column beside the content when
 * there is room for two, and a strip above it when there is not.
 *
 * - From `sm` up it is a column. `max-w` stops it swallowing a wide modal and
 *   `min-w` stops it collapsing in a narrow one; between those it is the
 *   column that gives way, because the prompts are what the user came for.
 * - Below `sm` there is no room for two columns, so it goes above the lists as
 *   a single row scrolling sideways. Capped in height either way: a library
 *   with thirty categories must not grow the picker until the lists have
 *   nothing left.
 */
export function PromptCategorySidebar(props: Props) {
  const { rows, selected, isFocusedPane, onSelect, onCreate, onRename, onDelete, onEditingChange } =
    props;
  const { t } = useTranslation('common');

  /** The category being renamed, or the sentinel while a new name is typed. */
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Escape cancels by unmounting the input, which can fire a trailing blur.
   * This tells the blur handler to skip committing, the same guard the session
   * list uses for the same reason.
   */
  const skipCommitRef = useRef(false);

  useEffect(() => {
    onEditingChange?.(editingKey !== null);
  }, [editingKey, onEditingChange]);

  useEffect(() => {
    if (editingKey !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingKey]);

  const startRename = (category: PromptCategory) => {
    setDraft(category.name);
    skipCommitRef.current = false;
    setEditingKey(category.id);
  };

  const startCreate = () => {
    setDraft('');
    skipCommitRef.current = false;
    setEditingKey(NEW_CATEGORY_KEY);
  };

  const commit = async () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      setEditingKey(null);
      return;
    }
    const key = editingKey;
    const trimmed = draft.trim();
    setEditingKey(null);
    if (key === null || trimmed === '') return;

    if (key === NEW_CATEGORY_KEY) {
      await onCreate(trimmed);
      return;
    }
    const row = rows.find((candidate) => candidate.key === key);
    if (row?.category && row.category.name !== trimmed) await onRename(key, trimmed);
  };

  const cancel = () => {
    skipCommitRef.current = true;
    setEditingKey(null);
  };

  const handleDraftKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Held inside the field so the sidebar's own arrow handling never moves the
    // selection out from under a name being typed.
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const rowClass = (isActive: boolean) =>
    `group/cat flex w-auto max-w-40 flex-shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-start text-xs transition-colors sm:w-full sm:max-w-none ${
      isActive
        ? 'bg-surface-selected text-text-primary'
        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
    } ${isActive && isFocusedPane ? 'ring-1 ring-inset ring-border-focus' : ''}`;

  return (
    <div className="flex max-h-24 shrink-0 flex-row gap-1 overflow-x-auto overflow-y-hidden border-b border-border-subtle pb-2 sm:max-h-none sm:w-44 sm:min-w-28 sm:max-w-52 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-e sm:pb-0 sm:pe-2">
      {rows.map((row) => {
        const isEditing = editingKey === row.key;
        return isEditing ? (
          <div key={row.key} className={rowClass(true)}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleDraftKeyDown}
              onBlur={() => void commit()}
              className="w-full min-w-0 border-b border-text-tertiary/40 bg-transparent text-xs text-text-primary outline-none"
            />
          </div>
        ) : (
          <button
            key={row.key}
            type="button"
            data-category-key={row.key}
            aria-pressed={selected === row.key}
            onClick={() => onSelect(row.key)}
            className={rowClass(selected === row.key)}
            title={row.label}
          >
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            {/* The count and the two actions share one slot, the way the `!!`
                panel's scope label shares its slot with the same two actions.

                The actions are positioned OUT OF FLOW on purpose. Drawn in
                flow they are 18px tall against the count's 16px, so the row
                grew by ~2px the moment the pointer touched it and the whole
                sidebar shifted under the cursor. Out of flow the count alone
                sets the height and the swap is invisible. */}
            <span className="relative flex-shrink-0 text-text-tertiary">
              <span className="group-hover/cat:invisible">({row.count})</span>
              {row.category && (
                <span className="absolute inset-y-0 end-0 hidden items-center gap-0.5 group-hover/cat:flex">
                  {/* Spans, not buttons: this sits inside the row's own button. */}
                  <span
                    role="button"
                    tabIndex={-1}
                    title={t('promptLibrary.edit')}
                    aria-label={t('promptLibrary.edit')}
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(row.category as PromptCategory);
                    }}
                    className="rounded p-0.5 text-text-tertiary transition-colors hover:text-text-primary"
                  >
                    <PencilSquareIcon className="h-3.5 w-3.5" />
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    title={t('promptLibrary.delete')}
                    aria-label={t('promptLibrary.delete')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(row.category as PromptCategory);
                    }}
                    className="rounded p-0.5 text-text-tertiary transition-colors hover:text-state-error-fg"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </span>
                </span>
              )}
            </span>
          </button>
        );
      })}

      {/* A new name has no row of its own to be typed into, so it gets one.
          Without this the add button hid itself and left nowhere to type. */}
      {editingKey === NEW_CATEGORY_KEY ? (
        <div className={rowClass(true)}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleDraftKeyDown}
            onBlur={() => void commit()}
            placeholder={t('promptLibrary.addCategory')}
            className="w-full min-w-0 border-b border-text-tertiary/40 bg-transparent text-xs text-text-primary placeholder:text-text-disabled outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={startCreate}
          className="flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span className="truncate">{t('promptLibrary.addCategory')}</span>
        </button>
      )}
    </div>
  );
}

/** Stands in for a category id while a brand new name is being typed. */
const NEW_CATEGORY_KEY = '__new__';
