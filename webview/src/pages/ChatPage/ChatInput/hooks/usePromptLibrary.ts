import { useState, useCallback, useRef, type RefObject } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
import { findPromptToken, PROMPT_TRIGGER } from '@/utils/findPromptToken';
import { groupPromptsByCategory } from '@/utils/promptCategories';
import type { GetPromptsAck, ScopedPrompt } from '@/types/prompt';
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

/** One row of the panel. Headings are drawn but not navigable. */
export type PromptRow =
  | { kind: 'prompt'; prompt: ScopedPrompt }
  /** A category name over the prompts that carry it, or null for the rest. */
  | { kind: 'heading'; category: string | null }
  /** The last row, which leaves for the settings page to add a prompt. */
  | { kind: 'create' };

/** Whether the arrow keys and Enter can land on [row]. */
export function isSelectableRow(row: PromptRow | undefined): boolean {
  return row !== undefined && row.kind !== 'heading';
}

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
  detectPrompt: (value: string, caretPosition: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => boolean;
  selectRow: (index: number) => void;
  /**
   * Remove one prompt and re-read the list, so the row disappears from the open
   * panel rather than waiting for the next time it is opened.
   */
  deletePrompt: (prompt: ScopedPrompt) => Promise<void>;
  close: () => void;
}

/**
 * Match a prompt against the typed query by name, content and category.
 *
 * Name and content so a user who remembers a phrase but not the name they gave
 * it still finds it; category so typing the group narrows to it, which is the
 * other half of what grouping is for — browse by heading, or jump straight past
 * the headings to a group by name.
 */
function matchesQuery(prompt: ScopedPrompt, query: string): boolean {
  if (query === '') return true;
  const lowered = query.toLowerCase();
  return (
    prompt.name.toLowerCase().includes(lowered) ||
    prompt.content.toLowerCase().includes(lowered) ||
    (prompt.category?.toLowerCase().includes(lowered) ?? false)
  );
}

/**
 * The next row the selection can land on, [step] rows away and wrapping.
 *
 * Headings are drawn between the prompts, and stepping onto one would leave the
 * highlight on a row Enter cannot use. Bounded by the row count so a list of
 * nothing but headings cannot spin forever.
 */
/**
 * The first row the selection can land on.
 *
 * The list starts at index 0 and index 0 is a heading whenever the prompts are
 * grouped, so without this the panel opens with nothing usable highlighted and
 * Enter does nothing.
 */
export function firstSelectableIndex(rows: PromptRow[]): number {
  const index = rows.findIndex(isSelectableRow);
  return index === -1 ? 0 : index;
}

export function stepSelection(rows: PromptRow[], from: number, step: 1 | -1): number {
  if (rows.length === 0) return 0;
  let index = from;
  for (let moved = 0; moved < rows.length; moved += 1) {
    index = (index + step + rows.length) % rows.length;
    if (isSelectableRow(rows[index])) return index;
  }
  return from;
}

const EMPTY_STATE: PromptLibraryState = {
  isActive: false,
  query: '',
  triggerIndex: -1,
  loaded: [],
  selectedIndex: 0,
  isLoading: false,
  hasLoaded: false,
};

export function usePromptLibrary(params: UsePromptLibraryParams): UsePromptLibraryReturn {
  const { workingDirectory, value, onChange, inputRef, onPastePrompt, onCreatePrompt, requestFill } =
    params;
  const bridge = useBridgeContext();

  const [state, setState] = useState<PromptLibraryState>(EMPTY_STATE);

  const valueRef = useRef(value);
  valueRef.current = value;

  const close = useCallback(() => {
    // The loaded prompts are deliberately kept: closing the panel is not a
    // reason to refetch when the user opens it again two keystrokes later.
    setState(prev => ({ ...prev, isActive: false, query: '', triggerIndex: -1, selectedIndex: 0 }));
  }, []);

  /**
   * Read both scopes and keep the union.
   *
   * Project prompts are listed before global ones because a project-specific
   * phrase is the more specific answer when both match what the user typed.
   */
  const load = useCallback(() => {
    setState(prev => ({ ...prev, isLoading: true }));

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

  const matching = state.loaded.filter(prompt => matchesQuery(prompt, state.query));
  // Grouped through the same helper the library modal uses, so one list of one
  // thing is arranged one way. Headings appear only once the prompts actually
  // split into more than one group; a single heading over everything is a row
  // that says nothing, and this panel is short.
  const groups = groupPromptsByCategory(matching);
  const rows: PromptRow[] = [
    ...groups.flatMap((group): PromptRow[] => [
      ...(groups.length > 1
        ? [{ kind: 'heading', category: group.category } as PromptRow]
        : []),
      ...group.prompts.map((prompt): PromptRow => ({
        kind: 'prompt',
        prompt: prompt as ScopedPrompt,
      })),
    ]),
    { kind: 'create' },
  ];

  /**
   * Where the highlight actually sits.
   *
   * The stored index can point at a heading — on opening, and after typing
   * regroups the list under the same index — so it is resolved to a usable row
   * here rather than in each of the three places that read it.
   */
  const selectedIndex = isSelectableRow(rows[state.selectedIndex])
    ? state.selectedIndex
    : firstSelectableIndex(rows);

  const selectRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row || row.kind === 'heading') return;

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

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setState(prev => ({
          ...prev,
          selectedIndex: stepSelection(rows, isSelectableRow(rows[prev.selectedIndex]) ? prev.selectedIndex : firstSelectableIndex(rows) - 1, 1),
        }));
        return true;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setState(prev => ({
          ...prev,
          selectedIndex: stepSelection(rows, isSelectableRow(rows[prev.selectedIndex]) ? prev.selectedIndex : firstSelectableIndex(rows), -1),
        }));
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
    [state.isActive, state.selectedIndex, rows.length, selectRow, close],
  );

  return {
    isActive: state.isActive,
    rows,
    selectedIndex,
    isLoading: state.isLoading,
    hasLoaded: state.hasLoaded,
    detectPrompt,
    handleKeyDown,
    selectRow,
    deletePrompt,
    close,
  };
}
