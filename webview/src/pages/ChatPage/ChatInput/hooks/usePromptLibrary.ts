import { useState, useCallback, useRef, type RefObject } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
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
}

interface UsePromptLibraryReturn {
  isActive: boolean;
  /** The rows to render, already filtered and with the create row appended. */
  rows: PromptRow[];
  selectedIndex: number;
  isLoading: boolean;
  hasLoaded: boolean;
  /** The category column's rows, already counted. Empty when nobody made any. */
  categoryRows: PanelCategoryRow[];
  selectedCategory: CategorySelection;
  focusedPane: PromptPane;
  selectCategory: (key: CategorySelection) => void;
  detectPrompt: (value: string, caretPosition: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => boolean;
  selectRow: (index: number) => void;
  /**
   * Remove one prompt and re-read the list, so the row disappears from the open
   * panel rather than waiting for the next time it is opened.
   */
  deletePrompt: (prompt: ScopedPrompt) => Promise<void>;
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
};

export function usePromptLibrary(params: UsePromptLibraryParams): UsePromptLibraryReturn {
  const { workingDirectory, value, onChange, inputRef, onPastePrompt, onCreatePrompt, requestFill } =
    params;
  const bridge = useBridgeContext();

  const [state, setState] = useState<PromptLibraryState>(EMPTY_STATE);

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
    }));
  }, []);

  /**
   * Read both scopes and keep the union.
   *
   * Project prompts are listed before global ones because a project-specific
   * phrase is the more specific answer when both match what the user typed.
   */
  const load = useCallback(() => {
    setState(prev => ({ ...prev, isLoading: true }));

    // Read with the prompts, because a category name is only reachable through
    // its record and the panel filters on both in the same keystroke.
    (bridge.send(MessageType.GET_PROMPT_CATEGORIES, {}) as Promise<PromptCategoriesAck>)
      .then((ack) => setState(prev => ({ ...prev, categories: ack?.categories ?? [] })))
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
        const global = (acks[0]?.prompts ?? []).map(
          (prompt): ScopedPrompt => ({ ...prompt, scope: 'global' }),
        );
        const project = (acks[1]?.prompts ?? []).map(
          (prompt): ScopedPrompt => ({ ...prompt, scope: 'project' }),
        );
        setState(prev => ({
          ...prev,
          loaded: [...project, ...global],
          selectedIndex: 0,
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
      load();
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
      load();
    },
    [bridge, workingDirectory, load],
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
  const rows: PromptRow[] = [
    ...state.loaded
      .filter(prompt => matchesCategorySelection(prompt, state.selectedCategory, state.categories))
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
  const categoryRows: PanelCategoryRow[] =
    state.categories.length === 0
      ? []
      : [
          { key: ALL_CATEGORIES, category: null, count: counts.all },
          ...state.categories.map((category) => ({
            key: category.id,
            category,
            count: counts.byId.get(category.id) ?? 0,
          })),
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>): boolean => {
      if (!state.isActive) return false;

      const hasCategories = categoryRows.length > 0;

      // Left and right cross between the two columns; up and down walk whichever
      // one was crossed into last. Left and right are only taken when there is a
      // second column to reach, so a library with no categories leaves the
      // composer's own caret movement alone.
      if (hasCategories && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        setFocusedPane(e.key === 'ArrowLeft' ? 'categories' : 'prompts');
        return true;
      }

      if (
        hasCategories &&
        state.focusedPane === 'categories' &&
        (e.key === 'ArrowDown' || e.key === 'ArrowUp')
      ) {
        e.preventDefault();
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
        setState(prev => ({ ...prev, selectedIndex: stepSelection(rows, selectedIndex, 1) }));
        return true;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setState(prev => ({ ...prev, selectedIndex: stepSelection(rows, selectedIndex, -1) }));
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
    ],
  );

  return {
    isActive: state.isActive,
    rows,
    selectedIndex,
    isLoading: state.isLoading,
    hasLoaded: state.hasLoaded,
    categoryRows,
    selectedCategory: state.selectedCategory,
    focusedPane: state.focusedPane,
    selectCategory,
    detectPrompt,
    handleKeyDown,
    selectRow,
    deletePrompt,
    setPromptCategories,
    close,
  };
}
