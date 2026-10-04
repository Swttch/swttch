import { useState, useCallback, useRef, type RefObject } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { usePromptOrderSync } from '@/hooks/usePromptOrderSync';
import { MessageType } from '@/shared';
import { dropStrayText } from '@/utils/dropStrayText';
import { getCaretOffset, setCaretOffset } from '@/utils/domSelection';
import { findPromptToken, PROMPT_TRIGGER } from '@/utils/findPromptToken';
import type {
  GetPromptsAck,
  PromptCategoriesAck,
  PromptCategory,
  ScopedPrompt,
} from '@/types/prompt';
import {
  ALL_CATEGORIES,
  countByCategory,
  matchesCategoryName,
  matchesCategorySelection,
  type CategorySelection,
} from '@/utils/promptCategories';
import {
  allRowIndex,
  applyCategoryOrder,
  columnIds,
  arrangeByScope,
  categoryOrderFromPriorities,
  orderViewOf,
} from '@/utils/promptOrder';
import {
  useCategoryOrder,
  usePromptOrder,
  usePromptOrderByCategory,
  hydrateCategoryOrder,
  hydratePromptOrder,
} from '@/utils/promptOrderStore';
import { moveCategoryBy, movePromptBy } from '@/utils/promptReorderCommands';
import { replaceRangeWithText } from '../RichInput/replaceRangeWithText';

/**
 * The prompt library dropdown: `!!` opens it, picking a row pastes that prompt's
 * text over the `!!query` token.
 *
 * Pasting rather than sending is the whole feature. The user saved the phrase so
 * they would not have to type it again, and they still want to read it, add a
 * detail and then send — which is why this is not the slash command panel, where
 * picking a row runs something.
 */

/** One row of the panel. */
export type PromptRow =
  | { kind: 'prompt'; prompt: ScopedPrompt }
  /** The last row, which leaves for the settings page to add a prompt. */
  | { kind: 'create' };

/** One row of the panel's category column. */
export interface PanelCategoryRow {
  /** A category id, or the sentinel for "everything". */
  key: CategorySelection;
  /** Null on the "everything" row, which the panel names itself. */
  category: PromptCategory | null;
  count: number;
}

/** Which of the panel's two columns the up and down arrows act on. */
export type PromptPane = 'categories' | 'prompts';

interface PromptLibraryState {
  isActive: boolean;
  query: string;
  triggerIndex: number;
  /** Every prompt of both scopes, unfiltered, as last read from the backend. */
  loaded: ScopedPrompt[];
  selectedIndex: number;
  isLoading: boolean;
  /** True once a load has resolved, so an empty list can be told from "not yet". */
  hasLoaded: boolean;
  /** The category records, read alongside the prompts so names can be matched. */
  categories: PromptCategory[];
  /** Which category the list is narrowed to. Every opening starts on "everything". */
  selectedCategory: CategorySelection;
  focusedPane: PromptPane;
  /**
   * True once the user has walked the list with the arrow keys since the last
   * thing they typed.
   *
   * The composer keeps the real focus while this panel is open, so `e` and
   * Backspace are also the letters of the query being typed. They only become
   * commands after the user has moved off the query into the rows with the
   * arrows, and typing anything puts them back to being letters.
   */
  navigated: boolean;
  /** The category whose name is being edited in place, or null. */
  editingCategory: string | null;
}

interface UsePromptLibraryParams {
  /** The project whose project-scope prompts belong in the list. */
  workingDirectory: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  /**
   * The composer's editable element. The paste goes through the browser's
   * editing pipeline on this node so it lands in its undo history (issue #286).
   */
  inputRef?: RefObject<HTMLElement | null>;
  /**
   * Called with the caret offset just past the pasted text and the full composer
   * value that offset applies to, so the composer can restore the caret and
   * re-run the caret-dependent checks that decide who owns the shared slot.
   */
  onPastePrompt: (caretOffset: number, nextValue: string) => void;
  /** Called when the user picks the last row, to open the prompt settings page. */
  onCreatePrompt: () => void;
  /**
   * Hands the picked prompt over for its `{{...}}` placeholders to be answered,
   * then calls back with the text to paste. A prompt without placeholders calls
   * back at once, so the ordinary case is unchanged.
   */
  requestFill: (content: string, onFilled: (filled: string) => void) => void;
  /** Open this prompt's edit screen. Called by `e` and the right arrow on a highlighted prompt. */
  onEditPrompt?: (prompt: ScopedPrompt) => void;
  /** Ask to delete this prompt. Called by Backspace on a highlighted prompt. */
  onDeletePrompt?: (prompt: ScopedPrompt) => void;
  /** Ask to delete this category. Called by Backspace on a highlighted category. */
  onDeleteCategory?: (category: PromptCategory) => void;
}

interface UsePromptLibraryReturn {
  isActive: boolean;
  /** The rows to render, already filtered and with the create row appended. */
  rows: PromptRow[];
  /** Every prompt of both scopes, which an order always covers whole. */
  allPrompts: ScopedPrompt[];
  /** The prompts that belong to the picked category, whatever the typed query says. */
  memberPrompts: ScopedPrompt[];
  selectedIndex: number;
  isLoading: boolean;
  hasLoaded: boolean;
  /** The category column's rows, already counted. Empty when nobody made any. */
  categoryRows: PanelCategoryRow[];
  selectedCategory: CategorySelection;
  focusedPane: PromptPane;
  /** The category whose name is being edited in place, or null. */
  editingCategory: string | null;
  selectCategory: (key: CategorySelection) => void;
  /** Save a new name for a category, and leave edit mode. */
  renameCategory: (id: string, name: string) => Promise<void>;
  /** Leave edit mode and keep the old name. */
  cancelCategoryEdit: () => void;
  /** Remove a category and re-read the library. Its prompts stay. */
  deleteCategory: (category: PromptCategory) => Promise<void>;
  detectPrompt: (value: string, caretPosition: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => boolean;
  handleKeyUp: (e: React.KeyboardEvent<HTMLElement>) => boolean;
  selectRow: (index: number) => void;
  /**
   * Remove one prompt and re-read the list, so the row disappears from the open
   * panel rather than waiting for the next time it is opened.
   */
  deletePrompt: (prompt: ScopedPrompt) => Promise<void>;
  /** Read the library again, keeping the highlight where it is. */
  reload: () => void;
  /** Give the composer the focus back with the caret where it was when an edit began. */
  returnFocusToComposer: () => void;
  /**
   * File a prompt under a different set of categories and re-read the list.
   *
   * Used by dragging a row onto a category chip, which is the same gesture the
   * library modal offers. Nothing else about the prompt changes: its name and
   * content travel back unedited, because UPDATE_PROMPT writes the whole row.
   */
  setPromptCategories: (prompt: ScopedPrompt, categoryIds: string[]) => Promise<void>;
  close: () => void;
}

/**
 * Match a prompt against the typed query by name, content and category.
 *
 * Name and content so a user who remembers a phrase but not the name they gave
 * it still finds it; category so typing the group narrows to it, which is the
 * other half of what grouping is for — pick the group in the column beside the
 * list, or name it and skip the column.
 */
function matchesQuery(
  prompt: ScopedPrompt,
  query: string,
  categories: PromptCategory[],
): boolean {
  if (query === '') return true;
  const lowered = query.toLowerCase();
  return (
    prompt.name.toLowerCase().includes(lowered) ||
    prompt.content.toLowerCase().includes(lowered) ||
    matchesCategoryName(prompt, query, categories)
  );
}

/** The row [step] away from [from], wrapping at both ends. */
export function stepSelection(rows: PromptRow[], from: number, step: 1 | -1): number {
  if (rows.length === 0) return 0;
  return (from + step + rows.length) % rows.length;
}

const EMPTY_STATE: PromptLibraryState = {
  isActive: false,
  query: '',
  triggerIndex: -1,
  loaded: [],
  selectedIndex: 0,
  isLoading: false,
  hasLoaded: false,
  categories: [],
  selectedCategory: ALL_CATEGORIES,
  focusedPane: 'prompts',
  navigated: false,
  editingCategory: null,
};

export function usePromptLibrary(params: UsePromptLibraryParams): UsePromptLibraryReturn {
  const {
    workingDirectory,
    value,
    onChange,
    inputRef,
    onPastePrompt,
    onCreatePrompt,
    requestFill,
    onEditPrompt,
    onDeletePrompt,
    onDeleteCategory,
  } = params;
  const bridge = useBridgeContext();
  usePromptOrderSync(workingDirectory);

  const [state, setState] = useState<PromptLibraryState>(EMPTY_STATE);

  /**
   * True between the `e` key going down and coming back up.
   *
   * Edit mode is entered on the key coming UP, not down. Under an IME the key
   * going down is also the start of a composition, and the text it produces (`ㄷ`
   * on a Korean layout) is delivered to whatever has the focus after the key
   * handler returns. Moving the focus into a name field on the keydown therefore
   * typed the key into the field it had just opened. The keydown is only held
   * back, and the edit opens when the key is released.
   */
  const editKeyDown = useRef(false);
  /** The composer's text when that key went down, to take the key's own character back out. */
  const textBeforeEditKey = useRef<string | null>(null);
  /** Where the caret was in the composer when the edit began, to put it back afterwards. */
  const caretBeforeEdit = useRef<number | null>(null);
  const noteEditKeyDown = () => {
    editKeyDown.current = true;
    const composer = inputRef?.current;
    textBeforeEditKey.current = composer?.textContent ?? null;
    caretBeforeEdit.current = composer ? getCaretOffset(composer) : null;
  };

  const valueRef = useRef(value);
  valueRef.current = value;

  /**
   * The focused pane is plain state here, unlike the library modal, which keeps
   * a ref alongside it. The difference is where the handler lives: the modal
   * registers its listener from an effect, so a key arriving before the effect
   * re-subscribes still runs the previous render's closure. This one is called
   * through the current render's closure every time, so state is already
   * current by the second arrow key.
   */
  const setFocusedPane = useCallback((pane: PromptPane) => {
    setState(prev => (prev.focusedPane === pane ? prev : { ...prev, focusedPane: pane }));
  }, []);

  const close = useCallback(() => {
    // The loaded prompts are deliberately kept: closing the panel is not a
    // reason to refetch when the user opens it again two keystrokes later.
    // The narrowing is not kept, because `!!` is a fresh search every time and
    // a list silently hiding most of the library is the worst thing it can do.
    setState(prev => ({
      ...prev,
      isActive: false,
      query: '',
      triggerIndex: -1,
      selectedIndex: 0,
      selectedCategory: ALL_CATEGORIES,
      focusedPane: 'prompts',
      navigated: false,
      editingCategory: null,
    }));
  }, []);

  /**
   * Read both scopes and keep the union.
   *
   * Project prompts are listed before global ones because a project-specific
   * phrase is the more specific answer when both match what the user typed.
   */
  const load = useCallback((keepSelection = false) => {
    setState(prev => ({ ...prev, isLoading: true }));

    // Read with the prompts, because a category name is only reachable through
    // its record and the panel filters on both in the same keystroke.
    (bridge.send(MessageType.GET_PROMPT_CATEGORIES, {}) as Promise<PromptCategoriesAck>)
      .then((ack) => {
        const read = ack?.categories ?? [];
        const order = categoryOrderFromPriorities(read);
        hydrateCategoryOrder(order);
        // Every opening starts on the top row of the column, whichever row that
        // is, and the first prompt of that category is the highlighted one. A
        // re-read after an edit keeps the user where they are.
        const firstRow = columnIds(read, order)[0] ?? ALL_CATEGORIES;
        setState(prev => ({
          ...prev,
          categories: read,
          ...(keepSelection ? {} : { selectedCategory: firstRow }),
        }));
      })
      .catch(() => setState(prev => ({ ...prev, categories: [] })));

    const requests: Array<Promise<GetPromptsAck>> = [
      bridge.send(MessageType.GET_PROMPTS, { scope: 'global' }) as Promise<GetPromptsAck>,
    ];
    if (workingDirectory) {
      requests.push(
        bridge.send(MessageType.GET_PROMPTS, {
          scope: 'project',
          workingDir: workingDirectory,
        }) as Promise<GetPromptsAck>,
      );
    }

    Promise.all(requests)
      .then((acks) => {
        // An unreadable library answers with an error, not with a rejection. Its empty
        // list must not be drawn, nor fill the order caches: the panel keeps what it had.
        if (acks.some((ack) => ack?.status === 'error')) throw new Error('Failed to load prompts');

        for (const ack of acks) {
          hydratePromptOrder(ack.scope, (ack.prompts ?? []).map((prompt) => prompt.id), ack.orderByCategory ?? {});
        }
        const global = (acks[0]?.prompts ?? []).map(
          (prompt): ScopedPrompt => ({ ...prompt, scope: 'global' }),
        );
        const project = (acks[1]?.prompts ?? []).map(
          (prompt): ScopedPrompt => ({ ...prompt, scope: 'project' }),
        );
        setState(prev => ({
          ...prev,
          loaded: [...project, ...global],
          selectedIndex: keepSelection ? prev.selectedIndex : 0,
          isLoading: false,
          hasLoaded: true,
        }));
      })
      .catch(() => {
        setState(prev => ({ ...prev, isLoading: false, hasLoaded: true }));
      });
  }, [bridge, workingDirectory]);

  const deletePrompt = useCallback(
    async (prompt: ScopedPrompt) => {
      await bridge.send(MessageType.DELETE_PROMPT, {
        scope: prompt.scope,
        ...(prompt.scope === 'project' ? { workingDir: workingDirectory } : {}),
        id: prompt.id,
      });
      load(true);
    },
    [bridge, workingDirectory, load],
  );

  const setPromptCategories = useCallback(
    async (prompt: ScopedPrompt, categoryIds: string[]) => {
      await bridge.send(MessageType.UPDATE_PROMPT, {
        scope: prompt.scope,
        ...(prompt.scope === 'project' ? { workingDir: workingDirectory } : {}),
        id: prompt.id,
        name: prompt.name,
        content: prompt.content,
        categories: categoryIds,
      });
      load(true);
    },
    [bridge, workingDirectory, load],
  );

  /**
   * The name field had the focus; the composer gets it back so typing goes on.
   *
   * Not in the same breath as the key that ended the edit: that key (an Enter,
   * above all) is still being delivered, and landing it on the composer is how a
   * category rename sent the message. A tick later it has finished.
   */
  const returnFocusToComposer = useCallback(() => {
    setTimeout(() => {
      const composer = inputRef?.current;
      if (!composer) return;
      composer.focus();
      // Focusing a contentEditable puts the caret at its start. The caret has to
      // be where it was, after the `!!`: before it, the `!!` is no longer the
      // token at the caret and the panel stops answering the keys.
      if (caretBeforeEdit.current !== null) setCaretOffset(composer, caretBeforeEdit.current);
    }, 0);
  }, [inputRef]);

  const cancelCategoryEdit = useCallback(() => {
    setState(prev => ({ ...prev, editingCategory: null }));
    returnFocusToComposer();
  }, [returnFocusToComposer]);

  const renameCategory = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      const current = state.categories.find(category => category.id === id);
      setState(prev => ({ ...prev, editingCategory: null }));
      returnFocusToComposer();
      if (trimmed === '' || current?.name === trimmed) return;

      const ack = (await bridge.send(MessageType.RENAME_PROMPT_CATEGORY, {
        id,
        name: trimmed,
      })) as PromptCategoriesAck;
      if (ack?.status === 'error' || !ack?.categories) return;
      const renamed = ack.categories;
      hydrateCategoryOrder(categoryOrderFromPriorities(renamed));
      setState(prev => ({ ...prev, categories: renamed }));
    },
    [bridge, returnFocusToComposer, state.categories],
  );

  const deleteCategory = useCallback(
    async (category: PromptCategory) => {
      await bridge.send(MessageType.DELETE_PROMPT_CATEGORY, { id: category.id });
      // The row the user stood on is gone; "everything" is where it goes back to.
      setState(prev => ({
        ...prev,
        selectedCategory: prev.selectedCategory === category.id ? ALL_CATEGORIES : prev.selectedCategory,
      }));
      load(true);
    },
    [bridge, load],
  );

  const detectPrompt = useCallback(
    (newValue: string, caretPosition: number) => {
      const token = findPromptToken(newValue, caretPosition);

      if (token === null) {
        setState(prev => (prev.isActive ? { ...prev, isActive: false, query: '', triggerIndex: -1, selectedIndex: 0 } : prev));
        return;
      }

      const wasActive = state.isActive;
      const isAlreadyActive = wasActive && state.triggerIndex === token.start;
      setState(prev => ({
        ...prev,
        isActive: true,
        query: token.query,
        triggerIndex: token.start,
        // Keep the user's place while they narrow the same token; reset when a
        // different `!!` opened the panel.
        selectedIndex: isAlreadyActive ? prev.selectedIndex : 0,
        // Typing hands `e` and Backspace back to the query.
        navigated: isAlreadyActive && token.query === prev.query ? prev.navigated : false,
      }));

      // Read the store on every OPENING, not once per session and not per
      // keystroke. Caching across openings would show a stale list to anyone who
      // adds a prompt on the settings page and comes straight back to the chat,
      // and the settings page is the only place prompts are written. Filtering
      // stays local, so narrowing the query never waits on the backend.
      if (!wasActive) load();
    },
    [state.isActive, state.triggerIndex, load],
  );

  // Both narrowings, in the order the user applies them: the column says which
  // part of the library is in play, the typed query finds within it.
  // The order the user dragged the prompts into comes first, so that the arrow
  // keys walk the list in the order it is drawn in. The library modal reads the
  // same order, which is why a drag on either screen is the order on both.
  // Inside a category the category's own order sits on top of the library's.
  const order = usePromptOrder();
  const orderByCategory = usePromptOrderByCategory();
  const orderView = orderViewOf(state.selectedCategory);
  const memberPrompts = arrangeByScope(
    state.loaded,
    order,
    orderView.kind === 'category' ? orderByCategory[orderView.id] : undefined,
  ).filter(prompt => matchesCategorySelection(prompt, state.selectedCategory, state.categories));
  const rows: PromptRow[] = [
    ...memberPrompts
      .filter(prompt => matchesQuery(prompt, state.query, state.categories))
      .map((prompt): PromptRow => ({ kind: 'prompt', prompt })),
    { kind: 'create' },
  ];

  /**
   * The category column.
   *
   * Counted over the whole library rather than over what the query left, so the
   * numbers do not move under the user while they type. There is no
   * "uncategorised" row and no way to add, rename or delete here: the panel is
   * a picker, and the library modal is where categories are kept.
   *
   * Empty when the user has made no categories, so the panel that shipped
   * before this is exactly the panel they still get.
   */
  const counts = countByCategory(state.loaded, state.categories);
  // The column in the order the user dragged it into, so the arrow keys walk it
  // in the order it is drawn in. The library modal reads the same order.
  const categoryColumnOrder = useCategoryOrder();
  const arrangedCategoryRows: PanelCategoryRow[] = applyCategoryOrder(
    state.categories,
    categoryColumnOrder,
  ).map((category) => ({
    key: category.id,
    category,
    count: counts.byId.get(category.id) ?? 0,
  }));
  // "All" is a row of the column like the categories and sits where the order
  // left it, with categories above it and below it.
  const allAt = allRowIndex(categoryColumnOrder, state.categories);
  const categoryRows: PanelCategoryRow[] =
    state.categories.length === 0
      ? []
      : [
          ...arrangedCategoryRows.slice(0, allAt),
          { key: ALL_CATEGORIES, category: null, count: counts.all },
          ...arrangedCategoryRows.slice(allAt),
        ];

  const selectCategory = useCallback((key: CategorySelection) => {
    // A different slice of the library is on screen now, so where the highlight
    // sat in the other column means nothing.
    setState(prev => ({
      ...prev,
      selectedCategory: key,
      selectedIndex: 0,
      focusedPane: 'categories',
    }));
  }, []);

  /**
   * Where the highlight actually sits.
   *
   * The stored index can point past the end after the category or the query
   * shortened the list, so it is resolved to a real row here rather than in
   * each of the three places that read it.
   */
  const selectedIndex = state.selectedIndex < rows.length ? state.selectedIndex : 0;

  const selectRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;

      if (row.kind === 'create') {
        // Leaving for the settings page will not bring the user back to this
        // token, so clear the `!!` they typed rather than stranding it in the
        // composer, and invalidate so the prompt they are about to add shows up.
        const { triggerIndex, query } = state;
        if (triggerIndex !== -1) {
          const currentValue = valueRef.current;
          const spanEnd = triggerIndex + PROMPT_TRIGGER.length + query.length;
          const el = inputRef?.current ?? null;
          const handledByBrowser = el ? replaceRangeWithText(el, triggerIndex, spanEnd, '') : false;
          if (!handledByBrowser) {
            onChange(currentValue.slice(0, triggerIndex) + currentValue.slice(spanEnd));
          }
        }
        close();
        onCreatePrompt();
        return;
      }

      const { triggerIndex, query } = state;
      if (triggerIndex === -1) {
        close();
        return;
      }

      const spanEnd = triggerIndex + PROMPT_TRIGGER.length + query.length;

      // Close first: the panel has served its purpose, and a prompt with
      // placeholders is about to put a dialog over the composer.
      close();

      // Placeholders are answered before anything is written, so cancelling
      // leaves the `!!query` the user typed untouched and they can pick again.
      requestFill(row.prompt.content, (pasted) => {
        // Replace the `!!query` span with the prompt's text. No trailing space
        // is added: the prompt is a whole phrase the user is about to edit, not
        // a token another word follows.
        const currentValue = valueRef.current;
        const nextValue =
          currentValue.slice(0, triggerIndex) + pasted + currentValue.slice(spanEnd);
        const caretOffset = triggerIndex + pasted.length;

        const el = inputRef?.current ?? null;
        const handledByBrowser = el
          ? replaceRangeWithText(el, triggerIndex, spanEnd, pasted)
          : false;
        if (!handledByBrowser) onChange(nextValue);

        onPastePrompt(caretOffset, nextValue);
      });
    },
    [rows, state, inputRef, onChange, onPastePrompt, onCreatePrompt, close, requestFill],
  );

  /**
   * The `e` key coming back up is what opens the edit, see `editKeyDown`.
   * Answers true when it used the key.
   */
  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLElement>): boolean => {
      if (e.code !== 'KeyE' || !editKeyDown.current) return false;
      editKeyDown.current = false;
      e.preventDefault();
      e.stopPropagation();
      // The key's own character may have landed in the composer, next to the `!!`.
      const composer = inputRef?.current;
      if (composer && textBeforeEditKey.current !== null) {
        dropStrayText(composer, textBeforeEditKey.current, onChange);
      }
      textBeforeEditKey.current = null;
      if (categoryRows.length > 0 && state.focusedPane === 'categories') {
        const category = categoryRows.find(row => row.key === state.selectedCategory)?.category;
        if (category) setState(prev => ({ ...prev, editingCategory: category.id }));
      } else {
        const row = rows[selectedIndex];
        if (row?.kind === 'prompt') onEditPrompt?.(row.prompt);
      }
      return true;
    },
    [state.focusedPane, state.selectedCategory, categoryRows, rows, selectedIndex, onEditPrompt, inputRef, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>): boolean => {
      if (!state.isActive) return false;

      const hasCategories = categoryRows.length > 0;

      // With Alt held, up and down move the highlighted row itself instead of the
      // highlight: the same move a drag makes, for someone who is not using a
      // pointer. Whichever column has the arrows is the one that is rearranged.
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        if (hasCategories && state.focusedPane === 'categories') {
          // "All" sorts with the categories, so it moves like one.
          moveCategoryBy(state.categories, String(state.selectedCategory), delta);
        } else {
          const row = rows[selectedIndex];
          if (row?.kind === 'prompt') {
            const keyOf = (prompt: ScopedPrompt) => `${prompt.scope}:${prompt.id}`;
            const memberKeys = new Set(memberPrompts.map(keyOf));
            const shownIn = (scope: ScopedPrompt['scope']) =>
              rows.flatMap((candidate) =>
                candidate.kind === 'prompt' && candidate.prompt.scope === scope
                  ? [candidate.prompt.id]
                  : [],
              );
            const moved = movePromptBy({
              view: orderView,
              sources: {
                global: state.loaded.filter((prompt) => prompt.scope === 'global'),
                project: state.loaded.filter((prompt) => prompt.scope === 'project'),
              },
              isMember: (prompt) => memberKeys.has(keyOf(prompt)),
              shownIds: { global: shownIn('global'), project: shownIn('project') },
              scope: row.prompt.scope,
              promptId: row.prompt.id,
              delta,
            });
            // The highlight goes with the row it was on.
            if (moved) setState((prev) => ({ ...prev, selectedIndex: selectedIndex + delta }));
          }
        }
        return true;
      }

      // Edit and delete act on whichever row the highlight is on, but only once
      // the user has walked the rows with the arrows: until then the composer has
      // the focus and `e` and Backspace belong to the query being typed. `e` is
      // matched by its key position so it works under any layout.
      // A held `e` keeps repeating; none of the repeats is typed anywhere.
      if (e.code === 'KeyE' && editKeyDown.current) {
        e.preventDefault();
        e.stopPropagation();
        return true;
      }

      const bare = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.repeat;
      if (state.navigated && bare) {
        const wantsDelete = e.key === 'Backspace';
        // Right edits a prompt, but never a category: in the category column it
        // is the key that crosses into that category's prompts.
        const wantsEdit =
          e.code === 'KeyE' || (e.key === 'ArrowRight' && !(hasCategories && state.focusedPane === 'categories'));
        if (wantsEdit || wantsDelete) {
          if (hasCategories && state.focusedPane === 'categories') {
            // "All" is not a category: it cannot be edited or deleted.
            const category = categoryRows.find(row => row.key === state.selectedCategory)?.category;
            if (category && (wantsEdit || onDeleteCategory)) {
              e.preventDefault();
              if (e.code === 'KeyE') {
                // Held back until the key is released, see `editKeyDown`.
                e.stopPropagation();
                noteEditKeyDown();
              } else if (wantsEdit) {
                setState(prev => ({ ...prev, editingCategory: category.id }));
              } else {
                onDeleteCategory?.(category);
              }
              return true;
            }
          } else {
            const row = rows[selectedIndex];
            const action = wantsEdit ? onEditPrompt : onDeletePrompt;
            if (row?.kind === 'prompt' && action) {
              e.preventDefault();
              if (e.code === 'KeyE') {
                // Held back until the key is released, see `editKeyDown`.
                e.stopPropagation();
                noteEditKeyDown();
              } else {
                action(row.prompt);
              }
              return true;
            }
          }
        }
      }

      // Left and right cross between the two columns; up and down walk whichever
      // one was crossed into last. Left and right are only taken when there is a
      // second column to reach, so a library with no categories leaves the
      // composer's own caret movement alone.
      if (hasCategories && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        setState(prev => ({
          ...prev,
          navigated: true,
          focusedPane: e.key === 'ArrowLeft' ? 'categories' : 'prompts',
        }));
        return true;
      }

      if (
        hasCategories &&
        state.focusedPane === 'categories' &&
        (e.key === 'ArrowDown' || e.key === 'ArrowUp')
      ) {
        e.preventDefault();
        setState(prev => (prev.navigated ? prev : { ...prev, navigated: true }));
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const current = Math.max(
          0,
          categoryRows.findIndex((row) => row.key === state.selectedCategory),
        );
        const next = (current + step + categoryRows.length) % categoryRows.length;
        selectCategory(categoryRows[next].key);
        return true;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setState(prev => ({ ...prev, navigated: true, selectedIndex: stepSelection(rows, selectedIndex, 1) }));
        return true;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setState(prev => ({ ...prev, navigated: true, selectedIndex: stepSelection(rows, selectedIndex, -1) }));
        return true;
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (rows.length === 0) return false;
        e.preventDefault();
        selectRow(selectedIndex);
        return true;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        // Escape closes this panel and nothing else. Stopped here so it never
        // reaches the composer's listener, which reads it as "stop the stream".
        e.stopPropagation();
        close();
        return true;
      }

      return false;
    },
    [
      state.isActive,
      state.focusedPane,
      state.selectedCategory,
      categoryRows,
      rows,
      selectedIndex,
      selectCategory,
      setFocusedPane,
      selectRow,
      close,
      memberPrompts,
      orderView,
      state.navigated,
      onEditPrompt,
      onDeletePrompt,
      onDeleteCategory,
    ],
  );

  return {
    isActive: state.isActive,
    rows,
    allPrompts: state.loaded,
    memberPrompts,
    selectedIndex,
    isLoading: state.isLoading,
    hasLoaded: state.hasLoaded,
    categoryRows,
    selectedCategory: state.selectedCategory,
    focusedPane: state.focusedPane,
    editingCategory: state.editingCategory,
    selectCategory,
    renameCategory,
    cancelCategoryEdit,
    deleteCategory,
    detectPrompt,
    handleKeyDown,
    handleKeyUp,
    selectRow,
    deletePrompt,
    reload: () => load(true),
    returnFocusToComposer,
    setPromptCategories,
    close,
  };
}
