import { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import {
  INSERT_PROMPT_EVENT,
  PROMPT_EDIT_CLOSED_EVENT,
  type InsertPromptDetail,
} from '@/commandPalette/sections/context/items';
import type {
  ConflictStrategy,
  ImportItem,
  PromptLink,
  PromptScope,
  SavedPrompt,
} from '@/types/prompt';
import { usePromptStore } from './usePromptStore';
import { PromptList, buildPromptRows, matchesPromptQuery } from './PromptList';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { PromptForm } from './PromptForm';
import { PromptExportDialog, PromptImportDialog } from './PromptTransferDialog';
import { usePromptReorder } from '@/hooks/usePromptReorder';
import { useCategoryReorder } from '@/hooks/useCategoryReorder';
import { categoriesAfterDrop, readCategoryDrop, readPromptDrag } from '@/utils/promptDrag';
import { orderViewOf } from '@/utils/promptOrder';
import { PROMPT_SENSORS } from '@/utils/promptSensors';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';
import { PromptCategorySidebar, RenameRequest, buildSidebarRows } from './PromptCategorySidebar';
import {
  ALL_CATEGORIES,
  UNCATEGORISED,
  matchesCategorySelection,
  countByCategory,
  type CategorySelection,
} from '@/utils/promptCategories';

interface Props {
  onClose: () => void;
  /** Open straight on the create screen, for the "create" row of the `!!` panel. */
  initialView?: 'list' | 'create';
  /** Open straight on this prompt's edit screen, for a `!!` panel row's pencil. */
  initialEdit?: { scope: PromptScope; prompt: SavedPrompt };
}

type View =
  | { kind: 'list' }
  | { kind: 'create'; scope: PromptScope }
  | { kind: 'edit'; scope: PromptScope; prompt: SavedPrompt };

type TransferState =
  | null
  | { kind: 'export'; scope: PromptScope; prompts: SavedPrompt[] }
  | {
      kind: 'import';
      scope: PromptScope;
      items: ImportItem[];
      newCount: number;
      updateCount: number;
      links: PromptLink[];
    };

/**
 * The prompt library: where saved phrases are written, edited and removed.
 *
 * An overlay modal rather than a settings page, and reached from the command
 * palette's Context section, because the library is something the user reaches
 * for mid-conversation — the same way they reach for MCP servers. Its chrome
 * deliberately mirrors {@link McpModal} so the two read as one kind of screen.
 */
export function PromptLibraryModal({ onClose, initialView = 'list', initialEdit }: Props) {
  const { t } = useTranslation('common');
  const { workingDirectory } = useWorkingDir();
  const { confirmDialog, confirm } = useConfirmDialog();
  const store = usePromptStore();

  // Every other way in names its scope, because the button that opened it sat on
  // that scope's heading. The `!!` panel's create row is the one caller with no
  // scope to name, and global is the answer for it: a prompt reached for from
  // the composer is usually one the user wants everywhere, and project scope
  // does not exist at all when no project is open.
  const [view, setView] = useState<View>(() => {
    if (initialEdit) return { kind: 'edit', scope: initialEdit.scope, prompt: initialEdit.prompt };
    return initialView === 'create' ? { kind: 'create', scope: 'global' } : { kind: 'list' };
  });
  const [formBusy, setFormBusy] = useState(false);
  /**
   * Leave the edit screen for wherever it was reached from.
   *
   * Opened from inside the library, it goes back to the library's list. Opened
   * from the `!!` panel, the library was never on screen, so there is no list to
   * go back to: the whole modal closes and the panel underneath is what is left.
   */
  const leaveEdit = () => {
    if (initialEdit) onClose();
    else setView({ kind: 'list' });
  };
  useEffect(() => {
    if (!initialEdit) return;
    return () => {
      window.dispatchEvent(new CustomEvent(PROMPT_EDIT_CLOSED_EVENT));
    };
    // The origin is fixed for the life of the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /**
   * The transfer screen on top of the library, or null when none is open.
   *
   * Held here rather than in `view` because a transfer happens *over* the list:
   * cancelling one puts the user back where they were, with the same scroll and
   * the same selection.
   */
  const [transfer, setTransfer] = useState<TransferState>(null);
  /** The outcome line shown after a transfer, replaced by the next one. */
  const [transferNote, setTransferNote] = useState<string | null>(null);
  /**
   * Narrows both scopes at once.
   *
   * Scrolling is the wrong tool once a library is large, and both scopes grow
   * independently, so the answer to "where is that one prompt" has to be a
   * search rather than a longer scroll. Matching is by name AND content, the way
   * the `!!` panel matches.
   */
  const [query, setQuery] = useState('');
  /** Which sidebar row is chosen. Opens on "all", which is the whole library. */
  const [selectedCategory, setSelectedCategory] = useState<CategorySelection>(ALL_CATEGORIES);
  /**
   * Which of the two columns the arrows act on.
   *
   * Up and down move within a column and left and right move between them, so
   * something has to remember which column "within" means. Left and right are
   * the natural pair for a two-column screen, and the alternative — making the
   * lists and the sidebar fight over the same two keys — has no right answer.
   */
  const [focusedPane, setFocusedPane] = useState<'categories' | 'prompts'>('prompts');
  /**
   * The same value, readable the instant it is set.
   *
   * The key handler runs off a closure over state, so a Right immediately
   * followed by a Down — one intent, two keys, and easily inside one frame —
   * had the Down still acting on the column the Right had just left.
   */
  const focusedPaneRef = useRef(focusedPane);
  const focusPane = (pane: 'categories' | 'prompts') => {
    focusedPaneRef.current = pane;
    setFocusedPane(pane);
  };
  /** True while a category name is being typed, so the arrows leave the caret alone. */
  const [renamingCategory, setRenamingCategory] = useState(false);
  /** The category the keyboard asked to put into edit mode, if any. */
  const [renameRequest, setRenameRequest] = useState<RenameRequest | null>(null);
  /**
   * The delete handlers, made fresh on every render further down. The key
   * listener reads them from here so it keeps the newest ones without having to
   * re-subscribe whenever a render makes new functions.
   */
  /**
   * True between the `e` key going down and coming back up.
   *
   * Edit mode is entered on the key coming UP, not down. Under an IME the key
   * going down is also the start of a composition, and the text it produces
   * (`ㄷ` on a Korean layout) is delivered to whatever has the focus after the key
   * handler returns. Moving the focus into a name field on the keydown therefore
   * typed the key into the field it had just opened. The keydown is only held
   * back, and the field opens when the key is released.
   */
  const editKeyDown = useRef(false);
  const deleteActions = useRef({
    prompt: (_scope: PromptScope, _prompt: SavedPrompt) => {},
    category: (_category: { id: string; name: string }) => {},
  });
  const dialogRef = useRef<HTMLDivElement>(null);

  // The cards in the order they are drawn, which is also the order the arrow
  // keys walk. Built from one definition so the two cannot disagree.
  // Both narrowings, in the order the user applies them: the sidebar says which
  // part of the library is on screen, the search box then finds within it.
  const inCategory = (prompt: SavedPrompt) =>
    matchesCategorySelection(prompt, selectedCategory, store.categories) &&
    matchesPromptQuery(prompt, query);
  // The order the user has dragged the cards into comes before the narrowing, so
  // the arrow keys and the screen both walk the same list.
  const reorder = usePromptReorder(
    { global: store.globalPrompts, project: store.projectPrompts },
    {
      isShown: inCategory,
      isMember: (prompt) => matchesCategorySelection(prompt, selectedCategory, store.categories),
      view: orderViewOf(selectedCategory),
    },
  );
  const globalPrompts = reorder.lists.global;
  const projectPrompts = reorder.lists.project;
  const rows = buildPromptRows(globalPrompts, projectPrompts);

  // Counted over everything, not over what the search left: a count that moved
  // as the user typed would stop meaning "how much is in here".
  const counts = countByCategory([...store.globalPrompts, ...store.projectPrompts], store.categories);
  // The column in the order the user dragged it into, so the arrow keys and the
  // screen walk the same rows.
  const categoryReorder = useCategoryReorder(store.categories);
  const sidebarRows = buildSidebarRows(
    categoryReorder.categories,
    counts,
    {
      all: t('promptLibrary.allCategories'),
      uncategorised: t('promptLibrary.uncategorised'),
    },
    categoryReorder.allIndex,
  );
  const selectedCategoryIndex = Math.max(
    0,
    sidebarRows.findIndex((row) => row.key === selectedCategory),
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  // The library opens on the top row of the column, whichever row that is: with
  // "All" dragged to the bottom, the first category is where the user starts, and
  // its first prompt is the highlighted one. Once, when the first read lands; a
  // later read (after an edit) must not move the user off where they are.
  const openedOnFirstRow = useRef(false);
  useEffect(() => {
    if (openedOnFirstRow.current || store.loading) return;
    openedOnFirstRow.current = true;
    const first = sidebarRows[0]?.key;
    if (first !== undefined) setSelectedCategory(first);
    // Reads the rows of the render the load finished in, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.loading]);

  // A reload can shorten the list under the selection — deleting the last card
  // is the everyday way — so pull it back inside the list rather than leaving it
  // pointing past the end, where Enter would do nothing and the highlight would
  // vanish with no way to tell why.
  const boundedIndex = rows.length === 0 ? -1 : Math.min(selectedIndex, rows.length - 1);
  const selectedRow = boundedIndex === -1 ? null : rows[boundedIndex] ?? null;

  /**
   * Whether an Enter press is one the user started here, on this screen.
   *
   * Holding Enter on the Save button kept firing auto-repeat keydowns; the save
   * switched the modal to the list mid-hold, and the next repeat was read as
   * "use the selected prompt" — one physical press doing two things (issue
   * #430). Arming only on keyup makes a press count once: a keystroke that began
   * before this screen appeared can never act on it, whichever screen it was.
   */
  const enterArmed = useRef(false);
  useEffect(() => { enterArmed.current = false; }, [view.kind]);
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Enter') enterArmed.current = true;
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, []);


  /** Which scope's list a transfer applies to. */
  const promptsOf = (scope: PromptScope) =>
    scope === 'global' ? store.globalPrompts : store.projectPrompts;


  const openExport = (scope: PromptScope) => {
    setTransferNote(null);
    setTransfer({ kind: 'export', scope, prompts: promptsOf(scope) });
  };

  /**
   * Read a file and show what importing it would do.
   *
   * The file picker is the host's and opens before this screen, so a user who
   * changes their mind there is simply back on the list with nothing shown.
   */
  const openImport = async (scope: PromptScope) => {
    setTransferNote(null);
    const ack = await store.previewImport(scope);
    if (ack?.cancelled) return;
    if (ack?.status === 'error' || !ack?.items) {
      setTransferNote(transferError(ack?.error));
      return;
    }
    setTransfer({
      kind: 'import',
      scope,
      items: ack.items,
      newCount: ack.newCount ?? 0,
      updateCount: ack.updateCount ?? 0,
      links: ack.links ?? [],
    });
  };

  /** Turn a backend error code into the sentence for it. */
  const transferError = (code: string | undefined): string => {
    const known: Record<string, string> = {
      'not-json': 'notJson',
      'unrecognised-shape': 'unrecognisedShape',
      'no-prompts': 'noPrompts',
      'unreadable-file': 'unreadableFile',
    };
    const key = code ? known[code] : undefined;
    return t(`promptLibrary.transfer.error.${key ?? 'failed'}`);
  };

  const confirmExport = async (scope: PromptScope, ids: string[]) => {
    setTransfer(null);
    const ack = await store.exportPrompts(scope, ids);
    if (ack?.status === 'error') {
      setTransferNote(transferError(ack.error));
      return;
    }
    // A null path means the save dialog was cancelled, which needs no notice.
    if (ack?.path) {
      setTransferNote(t('promptLibrary.transfer.exportDone', { count: ack.count }));
    }
  };

  const confirmImport = async (
    scope: PromptScope,
    prompts: SavedPrompt[],
    strategy: ConflictStrategy,
    links: PromptLink[],
  ) => {
    setTransfer(null);
    const ack = await store.importPrompts(scope, prompts, strategy, links);
    if (ack?.status === 'error') {
      setTransferNote(transferError(ack.error));
      return;
    }
    setTransferNote(
      t('promptLibrary.transfer.importDone', {
        imported: ack?.imported ?? 0,
        updated: ack?.updated ?? 0,
        skipped: ack?.skipped ?? 0,
      }),
    );
  };

  /** Put a saved prompt in the composer, which is what picking one means. */
  const usePrompt = (content: string) => {
    onClose();
    // After the close, so the modal's focus trap has released the composer and
    // the insert lands where the user can see it.
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent<InsertPromptDetail>(INSERT_PROMPT_EVENT, { detail: { content } }),
      );
    }, 0);
  };

  // Focus trap for the lifetime of the modal, mirroring McpModal: the composer
  // underneath runs auto-focus timers that pull focus back to itself, and the
  // window-focus one fires while activeElement is document.body, where focus
  // lands after a click on a non-focusable area inside this modal.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleFocusIn = (e: FocusEvent) => {
      const dialog = dialogRef.current;
      if (dialog && e.target instanceof Node && !dialog.contains(e.target)) {
        dialog.focus();
      }
    };
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  // Escape belongs to whatever is on top: this modal, or the confirm dialog and
  // the transfer dialogs above it. The layer takes the key before the composer
  // does, so closing the library or leaving the edit screen never also stops a
  // response that is still streaming behind it.
  useEscapeLayer(() => {
    if (formBusy) return true; // locked while a save is in flight
    if (view.kind === 'edit') {
      leaveEdit();
    } else if (view.kind !== 'list') {
      setView({ kind: 'list' });
    } else {
      onClose();
    }
    return true;
  });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {

      // Arrow navigation belongs to the list only. While a form is open the
      // arrows move the caret inside the name and content fields, which is what
      // the user means by them there — and the same goes for a category name
      // being typed in the sidebar.
      if (view.kind !== 'list' || formBusy || renamingCategory) return;

      // With Alt held, up and down move the highlighted row itself instead of the
      // highlight. The same move a drag makes, for someone who is not using a
      // pointer: whichever column has the arrows is the one that is rearranged.
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        if (focusedPaneRef.current === 'categories') {
          // "All" sorts with the categories; "uncategorised" is fixed at the bottom.
          const row = sidebarRows[selectedCategoryIndex];
          if (row && row.key !== UNCATEGORISED) categoryReorder.moveBy(String(row.key), delta);
        } else if (selectedRow && reorder.moveBy(selectedRow.scope, selectedRow.prompt.id, delta)) {
          // The highlight goes with the card it was on.
          setSelectedIndex(boundedIndex + delta);
        }
        return;
      }

      // A letter or a backspace typed into the search box is text, not a command.
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);

      // Up and down are the user leaving the search box for the list. Taking the
      // focus out of it is what makes the next `e` an edit instead of a letter.
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && typing) {
        dialogRef.current?.focus();
      }

      // Edit and delete act on whichever row the highlight is on. `e` is matched
      // by its physical key, so it works under any layout: the key that types
      // "e" on a Latin keyboard types a different letter on a Korean one.
      // A held `e` keeps repeating; none of the repeats is typed anywhere.
      if (e.code === 'KeyE' && editKeyDown.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const bare = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.repeat;
      if (!typing && bare) {
        const pressedE = e.code === 'KeyE';
        const wantsDelete = e.key === 'Backspace';
        // Right edits a prompt, but never a category: in the category column it
        // is the key that crosses into that category's prompts.
        const wantsEdit = pressedE || (e.key === 'ArrowRight' && focusedPaneRef.current === 'prompts');
        if (wantsEdit || wantsDelete) {
          const category =
            focusedPaneRef.current === 'categories' ? sidebarRows[selectedCategoryIndex]?.category : undefined;
          // "All" and "uncategorised" are not categories and cannot be edited or
          // deleted.
          const target = focusedPaneRef.current === 'categories' ? category : selectedRow;
          if (target) {
            e.preventDefault();
            if (pressedE) {
              // Held back until the key is released, see `editKeyDown`.
              e.stopPropagation();
              editKeyDown.current = true;
            } else if (category) {
              if (wantsEdit) setRenameRequest(new RenameRequest(category.id));
              else deleteActions.current.category(category);
            } else if (selectedRow) {
              if (wantsEdit) {
                setView({ kind: 'edit', scope: selectedRow.scope, prompt: selectedRow.prompt });
              } else {
                deleteActions.current.prompt(selectedRow.scope, selectedRow.prompt);
              }
            }
            return;
          }
        }
      }

      // Left and right cross between the two columns; up and down move within
      // whichever one they last crossed into.
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        focusPane('categories');
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        focusPane('prompts');
        return;
      }

      if (focusedPaneRef.current === 'categories') {
        if (sidebarRows.length === 0) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const step = e.key === 'ArrowDown' ? 1 : -1;
          const next =
            (selectedCategoryIndex + step + sidebarRows.length) % sidebarRows.length;
          setSelectedCategory(sidebarRows[next]?.key ?? ALL_CATEGORIES);
          // A different slice of the library is on screen, so the highlight in
          // the other column has nothing to do with where it was.
          setSelectedIndex(0);
        }
        return;
      }

      if (rows.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (Math.min(prev, rows.length - 1) + 1) % rows.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (Math.min(prev, rows.length - 1) - 1 + rows.length) % rows.length);
        return;
      }
      if (e.key === 'Enter') {
        if (!selectedRow || !enterArmed.current) return;
        e.preventDefault();
        usePrompt(selectedRow.prompt.content);
      }
    };
    // The `e` key coming back up is what opens the edit, see `editKeyDown`.
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || !editKeyDown.current) return;
      editKeyDown.current = false;
      e.preventDefault();
      e.stopPropagation();
      if (focusedPaneRef.current === 'categories') {
        const category = sidebarRows[selectedCategoryIndex]?.category;
        if (category) setRenameRequest(new RenameRequest(category.id));
      } else if (selectedRow) {
        setView({ kind: 'edit', scope: selectedRow.scope, prompt: selectedRow.prompt });
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [
    onClose,
    view,
    formBusy,
    rows.length,
    selectedRow,
    focusedPane,
    renamingCategory,
    sidebarRows,
    selectedCategoryIndex,
    boundedIndex,
    reorder,
    categoryReorder,
  ]);

  /**
   * Make a category from the prompt form and hand back its id.
   *
   * The backend answers every category message with the FULL list rather than
   * with the row it just wrote, so the new id is found by name. That is the
   * same case-insensitive rule the registry dedupes by, which is why asking for
   * a name that already exists returns the existing id instead of a second one.
   */
  const createCategoryForForm = async (name: string): Promise<string | null> => {
    const ack = await store.createCategory(name);
    const wanted = name.trim().toLowerCase();
    return ack?.categories?.find((c) => c.name.toLowerCase() === wanted)?.id ?? null;
  };

  /**
   * File a prompt by dropping it on a category.
   *
   * What the drop means is decided by `categoriesAfterDrop`, which the `!!`
   * panel uses too, so the gesture means the same thing on both screens. A null
   * answer means the drop changes nothing and no write happens — dropping a
   * prompt back on a category it already carries should not cost a round trip.
   */
  const handlePromptDrop = async (event: DragEndEvent) => {
    if (event.canceled) return;
    const dragged = readPromptDrag(event.operation.source?.data);
    const onto = readCategoryDrop(event.operation.target?.data);
    if (!dragged || !onto) return;

    const next = categoriesAfterDrop(dragged.categories, onto.key);
    if (next === null) return;

    const prompt = [...globalPrompts, ...projectPrompts].find((p) => p.id === dragged.promptId);
    if (!prompt) return;
    await store.update(dragged.scope, prompt.id, prompt.name, prompt.content, next);
  };

  /** Remove a category, after asking. Its prompts are kept. */
  const handleDeleteCategory = async (category: { id: string; name: string }) => {
    const confirmed = await confirm({
      title: t('promptLibrary.deleteCategoryTitle'),
      message: t('promptLibrary.deleteCategoryMessage', { name: category.name }),
      confirmLabel: t('promptLibrary.delete'),
      variant: 'danger',
    });
    if (!confirmed) return;
    await store.deleteCategory(category.id);
    // The row the user was standing on is gone; "all" is where it goes back to.
    setSelectedCategory((current) => (current === category.id ? ALL_CATEGORIES : current));
  };

  const handleCreate = async (
    scope: PromptScope,
    name: string,
    content: string,
    categoryIds: string[],
  ) => {
    await store.create(scope, name, content, categoryIds);
    setView({ kind: 'list' });
  };

  const handleUpdate = async (
    scope: PromptScope,
    id: string,
    name: string,
    content: string,
    categoryIds: string[],
  ) => {
    await store.update(scope, id, name, content, categoryIds);
    leaveEdit();
  };

  const handleDelete = async (scope: PromptScope, prompt: SavedPrompt) => {
    const confirmed = await confirm({
      title: t('promptLibrary.deleteTitle'),
      message: t('promptLibrary.deleteMessage', { name: prompt.name }),
      confirmLabel: t('promptLibrary.delete'),
      variant: 'danger',
    });
    if (!confirmed) return;
    await store.remove(scope, prompt.id);
  };
  deleteActions.current = {
    prompt: (scope, prompt) => void handleDelete(scope, prompt),
    category: (category) => void handleDeleteCategory(category),
  };

  const isListView = view.kind === 'list';

  return (
    <Portal>
      {confirmDialog}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (formBusy) return; // locked while a save is in flight
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={dialogRef}
          tabIndex={-1}
          /* Wider than the other overlays: each scope heading now carries three
             buttons beside a project name, and at the narrower width the name
             was the thing that gave way. */
          className={`w-full max-w-2xl bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden flex flex-col focus:outline-none ${formBusy ? 'pointer-events-none' : ''}`}
          style={{ maxHeight: 'min(50rem, 88vh)', minHeight: 'min(32rem, 88vh)' }}
        >
          {isListView && (
            <>
              <div className="flex items-center justify-between px-4 pt-4 pb-1 flex-shrink-0">
                <h2 className="text-lg font-semibold text-text-primary">{t('promptLibrary.title')}</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded text-text-tertiary hover:bg-surface-hover transition-colors"
                    aria-label={t('promptLibrary.cancel')}
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <p className="flex-shrink-0 px-4 pb-3 text-xs text-text-secondary">
                {t('promptLibrary.description')}
              </p>
              <div className="flex-shrink-0 px-4 pb-3">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('promptLibrary.searchPlaceholder')}
                  aria-label={t('promptLibrary.searchPlaceholder')}
                  className="w-full rounded-md border border-border-default bg-surface-base px-2 py-1.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
                />
              </div>
            </>
          )}

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {isListView && store.loading && (
              <div className="flex-1 flex items-center justify-center text-sm text-text-tertiary">
                {t('promptLibrary.loading')}
              </div>
            )}
            {isListView && !store.loading && store.error && (
              <div className="flex-1 flex items-center justify-center px-4">
                <p className="text-sm text-state-error-fg text-center">{t('promptLibrary.loadFailed')}</p>
              </div>
            )}
            {isListView && !store.loading && !store.error && (
              /* Two columns from `sm` up, stacked below it. The sidebar decides
                 which slice of the library the lists show, so it sits beside
                 them rather than above the search box that narrows within it. */
              <DragDropProvider
                sensors={PROMPT_SENSORS}
                onDragOver={(event) => {
                  // Each handler looks only at its own kind of drag.
                  reorder.onDragOver(event);
                  categoryReorder.onDragOver(event);
                }}
                onDragEnd={(event) => {
                  // One drop is one of three things, decided by what was held and
                  // where it landed: a card among the cards reorders them, a card
                  // on a category files it, a category among the categories
                  // reorders the column.
                  reorder.onDragEnd(event);
                  categoryReorder.onDragEnd(event);
                  void handlePromptDrop(event);
                }}
              >
              <div className="flex min-h-0 flex-1 flex-col px-4 sm:flex-row sm:gap-3">
                <PromptCategorySidebar
                  rows={sidebarRows}
                  selected={selectedCategory}
                  isFocusedPane={focusedPane === 'categories'}
                  onSelect={(key) => {
                    setSelectedCategory(key);
                    setSelectedIndex(0);
                    focusPane('categories');
                  }}
                  onCreate={(name) => store.createCategory(name)}
                  onRename={(id, name) => store.renameCategory(id, name)}
                  onDelete={(category) => void handleDeleteCategory(category)}
                  onEditingChange={setRenamingCategory}
                  renameRequest={renameRequest}
                />
                <PromptList
                sortable={reorder.sortable}
                note={
                  orderViewOf(selectedCategory).kind === 'category'
                    ? t('promptLibrary.categoryOrderNote')
                    : undefined
                }
                globalPrompts={globalPrompts}
                projectPrompts={projectPrompts}
                projectAvailable={store.projectAvailable}
                workingDirectory={workingDirectory}
                selectedId={selectedRow?.prompt.id ?? null}
                isFocusedPane={focusedPane === 'prompts'}
                onUse={(prompt) => usePrompt(prompt.content)}
                onEdit={(scope, prompt) => setView({ kind: 'edit', scope, prompt })}
                onDelete={(scope, prompt) => void handleDelete(scope, prompt)}
                onExport={(scope) => openExport(scope)}
                onImport={(scope) => void openImport(scope)}
                onCreate={(scope) => setView({ kind: 'create', scope })}
                />
              </div>
              </DragDropProvider>
            )}
            {isListView && transferNote && (
              <p className="flex-shrink-0 px-4 pb-2 text-xs text-text-tertiary">{transferNote}</p>
            )}
            {view.kind === 'create' && (
              <PromptForm
                categories={store.categories}
                onCreateCategory={createCategoryForForm}
                onSubmit={(name, content, categoryIds) =>
                  handleCreate(view.scope, name, content, categoryIds)
                }
                onCancel={() => setView({ kind: 'list' })}
                onBusyChange={setFormBusy}
              />
            )}
            {view.kind === 'edit' && (
              <PromptForm
                key={view.prompt.id}
                editing={view.prompt}
                categories={store.categories}
                onCreateCategory={createCategoryForForm}
                onSubmit={(name, content, categoryIds) =>
                  handleUpdate(view.scope, view.prompt.id, name, content, categoryIds)
                }
                onCancel={leaveEdit}
                onBusyChange={setFormBusy}
              />
            )}
          </div>
        </div>
      </div>

      {/* Over the library rather than in place of it: cancelling a transfer puts
          the user back on the same list, with the same scroll and selection. */}
      {transfer?.kind === 'export' && (
        <PromptExportDialog
          prompts={transfer.prompts}
          onConfirm={(ids) => void confirmExport(transfer.scope, ids)}
          onCancel={() => setTransfer(null)}
        />
      )}
      {transfer?.kind === 'import' && (
        <PromptImportDialog
          items={transfer.items}
          newCount={transfer.newCount}
          updateCount={transfer.updateCount}
          onConfirm={(prompts, strategy) =>
            void confirmImport(transfer.scope, prompts, strategy, transfer.links)
          }
          onCancel={() => setTransfer(null)}
        />
      )}
    </Portal>
  );
}
