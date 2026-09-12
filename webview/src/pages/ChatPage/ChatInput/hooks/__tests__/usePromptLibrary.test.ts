import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';
import { ALL_CATEGORIES } from '@/utils/promptCategories';
import type { PromptCategory, SavedPrompt } from '@/types/prompt';

// ---------------------------------------------------------------------------
// BridgeContext mock — GET_PROMPTS answers per scope, so the hook has a real
// two-scope list to filter and paste from.
// ---------------------------------------------------------------------------

const prompt = (id: string, name: string, content: string): SavedPrompt => ({
  id,
  name,
  content,
  createdAt: 1,
  updatedAt: 1,
});

let globalPrompts: SavedPrompt[] = [];
let projectPrompts: SavedPrompt[] = [];
let categories: PromptCategory[] = [];

const sendMock = vi.fn((type: string, payload?: Record<string, unknown>) => {
  if (type === MessageType.GET_PROMPTS) {
    const scope = payload?.scope;
    return Promise.resolve({
      scope,
      prompts: scope === 'project' ? projectPrompts : globalPrompts,
    });
  }
  if (type === MessageType.GET_PROMPT_CATEGORIES) {
    return Promise.resolve({ categories });
  }
  return Promise.resolve({});
});

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: sendMock,
    subscribe: vi.fn(() => vi.fn()),
    lastError: null,
  }),
}));

// Imported AFTER vi.mock so the mock is wired first.
import { usePromptLibrary, stepSelection, type PromptRow } from '../usePromptLibrary';

interface HarnessParams {
  value: string;
  onChange: (next: string) => void;
  onPastePrompt: (caretOffset: number, nextValue: string) => void;
  onCreatePrompt: () => void;
  /**
   * Stands in for the `{{...}}` dialog. Defaults to the no-placeholder path —
   * hand the content straight back — so every test that is not about variables
   * reads as it did before the gate existed.
   */
  requestFill?: (content: string, onFilled: (filled: string) => void) => void;
}

const fillImmediately = (content: string, onFilled: (filled: string) => void) => onFilled(content);

function renderLibrary(params: HarnessParams) {
  return renderHook(
    (props: HarnessParams) =>
      usePromptLibrary({
        workingDirectory: '/work',
        value: props.value,
        onChange: props.onChange,
        onPastePrompt: props.onPastePrompt,
        onCreatePrompt: props.onCreatePrompt,
        requestFill: props.requestFill ?? fillImmediately,
      }),
    { initialProps: params },
  );
}

const keyEvent = (key: string) =>
  ({ key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLElement>);

function makeParams(value: string) {
  return {
    value,
    onChange: vi.fn(),
    onPastePrompt: vi.fn(),
    onCreatePrompt: vi.fn(),
  };
}

describe('usePromptLibrary', () => {
  beforeEach(() => {
    sendMock.mockClear();
    globalPrompts = [prompt('g1', 'merge cleanup', 'Merged it, check and tidy up locally')];
    projectPrompts = [prompt('p1', 'demo check', 'Check this demo project')];
    categories = [];
  });

  it('stays closed until both bangs are typed', async () => {
    const params = makeParams('!');
    const { result } = renderLibrary(params);

    act(() => result.current.detectPrompt('!', 1));
    expect(result.current.isActive).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('opens on "!!" and lists project prompts before global ones', async () => {
    const params = makeParams('!!');
    const { result } = renderLibrary(params);

    act(() => result.current.detectPrompt('!!', 2));
    expect(result.current.isActive).toBe(true);

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows.map(row => (row.kind === 'prompt' ? row.prompt.id : 'create'))).toEqual([
      'p1',
      'g1',
      'create',
    ]);
  });

  it('filters by name and by content', async () => {
    const params = makeParams('!!');
    const { result } = renderLibrary(params);

    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    // "merge" matches the global prompt's NAME.
    act(() => result.current.detectPrompt('!!merge', 7));
    await waitFor(() =>
      expect(result.current.rows.map(r => (r.kind === 'prompt' ? r.prompt.id : 'create'))).toEqual(['g1', 'create']),
    );

    // "tidy" appears only in the global prompt's CONTENT.
    act(() => result.current.detectPrompt('!!tidy', 6));
    await waitFor(() =>
      expect(result.current.rows.map(r => (r.kind === 'prompt' ? r.prompt.id : 'create'))).toEqual(['g1', 'create']),
    );
  });

  it('pastes the prompt text over the "!!query" span and leaves the rest alone', async () => {
    const params = makeParams('before !!merge after');
    const { result } = renderLibrary(params);

    // Caret sits just past "!!merge": offsets 7..14.
    act(() => result.current.detectPrompt('before !!merge after', 14));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    act(() => result.current.selectRow(0));

    expect(params.onChange).toHaveBeenCalledWith('before Merged it, check and tidy up locally after');
    // The caret lands at the end of what was pasted, not at the end of the line.
    expect(params.onPastePrompt).toHaveBeenCalledWith(
      7 + 'Merged it, check and tidy up locally'.length,
      'before Merged it, check and tidy up locally after',
    );
    expect(result.current.isActive).toBe(false);
  });

  /**
   * Issue #430 — a saved prompt written on two lines pasted as one run-on
   * sentence. The line breaks must survive the paste exactly as they were
   * saved; replaceRangeWithText is what keeps them, and this pins the value the
   * hook reports either way.
   */
  it('keeps the line breaks of a multi-line prompt', async () => {
    projectPrompts = [prompt('p1', 'two lines', 'first line\nsecond line')];
    const params = makeParams('!!');
    const { result } = renderLibrary(params);

    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(1));
    act(() => result.current.selectRow(0));

    expect(params.onChange).toHaveBeenCalledWith('first line\nsecond line');
    expect(params.onPastePrompt).toHaveBeenCalledWith(
      'first line\nsecond line'.length,
      'first line\nsecond line',
    );
  });

  it('pastes without sending, so the composer keeps the text for editing', async () => {
    const params = makeParams('!!');
    const { result } = renderLibrary(params);

    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    act(() => result.current.selectRow(0));

    // The only thing that happened is a value change: no submit path exists on
    // this hook, and the panel closed rather than starting anything.
    expect(params.onChange).toHaveBeenCalledWith('Check this demo project');
    expect(result.current.isActive).toBe(false);
  });

  it('clears the "!!" token and leaves for settings when the create row is picked', async () => {
    const params = makeParams('keep this !!x');
    const { result } = renderLibrary(params);

    act(() => result.current.detectPrompt('keep this !!x', 13));
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));

    const createIndex = result.current.rows.findIndex(row => row.kind === 'create');
    act(() => result.current.selectRow(createIndex));

    expect(params.onChange).toHaveBeenCalledWith('keep this ');
    expect(params.onCreatePrompt).toHaveBeenCalledTimes(1);
    expect(params.onPastePrompt).not.toHaveBeenCalled();
  });

  /**
   * The settings page is the only place prompts are written, so a list cached
   * across openings would go stale the moment a user adds one and comes back.
   */
  it('reads the store again every time the panel opens', async () => {
    const params = makeParams('!!');
    const { result } = renderLibrary(params);

    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    const callsAfterFirstOpen = sendMock.mock.calls.length;

    // Close, then open again with a prompt that was added in between.
    act(() => result.current.detectPrompt('', 0));
    expect(result.current.isActive).toBe(false);
    projectPrompts = [...projectPrompts, prompt('p2', 'added later', 'Added while the panel was shut')];

    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() =>
      expect(result.current.rows.map(r => (r.kind === 'prompt' ? r.prompt.id : 'create'))).toEqual([
        'p1',
        'p2',
        'g1',
        'create',
      ]),
    );
    expect(sendMock.mock.calls.length).toBeGreaterThan(callsAfterFirstOpen);
  });

  it('does not read the store again on each keystroke of the same token', async () => {
    const params = makeParams('!!');
    const { result } = renderLibrary(params);

    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    const callsAfterOpen = sendMock.mock.calls.length;

    act(() => result.current.detectPrompt('!!m', 3));
    act(() => result.current.detectPrompt('!!me', 4));
    act(() => result.current.detectPrompt('!!mer', 5));

    expect(sendMock.mock.calls.length).toBe(callsAfterOpen);
  });

  describe('keyboard', () => {
    it('claims the arrow keys while open, so history recall never sees them', async () => {
      const params = makeParams('!!');
      const { result } = renderLibrary(params);
      act(() => result.current.detectPrompt('!!', 2));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));

      let handled = false;
      act(() => { handled = result.current.handleKeyDown(keyEvent('ArrowDown')); });
      expect(handled).toBe(true);
      expect(result.current.selectedIndex).toBe(1);

      act(() => { handled = result.current.handleKeyDown(keyEvent('ArrowUp')); });
      expect(handled).toBe(true);
      expect(result.current.selectedIndex).toBe(0);
    });

    it('claims Enter while open, so the composer never submits the "!!" text', async () => {
      const params = makeParams('!!');
      const { result } = renderLibrary(params);
      act(() => result.current.detectPrompt('!!', 2));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));

      let handled = false;
      act(() => { handled = result.current.handleKeyDown(keyEvent('Enter')); });
      expect(handled).toBe(true);
      expect(params.onChange).toHaveBeenCalledWith('Check this demo project');
    });

    it('closes on Escape and hands every key back once closed', async () => {
      const params = makeParams('!!');
      const { result } = renderLibrary(params);
      act(() => result.current.detectPrompt('!!', 2));
      await waitFor(() => expect(result.current.rows).toHaveLength(3));

      let handled = false;
      act(() => { handled = result.current.handleKeyDown(keyEvent('Escape')); });
      expect(handled).toBe(true);
      expect(result.current.isActive).toBe(false);

      act(() => { handled = result.current.handleKeyDown(keyEvent('Enter')); });
      expect(handled).toBe(false);
    });
  });
});

describe('stepSelection', () => {
  const promptRow = (id: string): PromptRow => ({
    kind: 'prompt',
    prompt: { id, name: id, content: id, scope: 'global', createdAt: 1, updatedAt: 1 },
  });

  it('moves one row at a time', () => {
    const rows = [promptRow('p1'), promptRow('p2'), promptRow('p3')];
    expect(stepSelection(rows, 0, 1)).toBe(1);
    expect(stepSelection(rows, 2, -1)).toBe(1);
  });

  it('wraps around both ends', () => {
    const rows = [promptRow('p1'), promptRow('p2')];
    expect(stepSelection(rows, 1, 1)).toBe(0);
    expect(stepSelection(rows, 0, -1)).toBe(1);
  });

  it('has nowhere to go in an empty list', () => {
    expect(stepSelection([], 0, 1)).toBe(0);
  });
});

/**
 * The panel's category column, which the library modal also has: picking a
 * category narrows the list, and the arrows cross between the two columns.
 */
describe('the category column', () => {
  const category = (id: string, name: string): PromptCategory => ({ id, name, createdAt: 1 });

  async function openWithCategories() {
    const params = makeParams('!!');
    const rendered = renderLibrary(params);
    act(() => rendered.result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(rendered.result.current.categoryRows.length).toBeGreaterThan(0));
    return rendered;
  }

  beforeEach(() => {
    sendMock.mockClear();
    categories = [category('c1', 'review'), category('c2', 'docs')];
    globalPrompts = [
      { ...prompt('g1', 'merge cleanup', 'merged it'), categories: ['c1'] },
      prompt('g2', 'plain', 'filed under nothing'),
    ];
    projectPrompts = [{ ...prompt('p1', 'demo check', 'check the demo'), categories: ['c2'] }];
  });

  /**
   * A user who never made a category must get the panel they had before this.
   * An empty column is also what tells the key handler to leave Left and Right
   * to the composer's own caret.
   */
  it('is empty when no categories exist', async () => {
    categories = [];
    const params = makeParams('!!');
    const { result } = renderLibrary(params);

    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.rows).toHaveLength(4));

    expect(result.current.categoryRows).toEqual([]);
  });

  it('leads with "everything" and counts each category over the whole library', async () => {
    const { result } = await openWithCategories();

    expect(result.current.categoryRows.map((row) => [row.key, row.count])).toEqual([
      [ALL_CATEGORIES, 3],
      ['c1', 1],
      ['c2', 1],
    ]);
  });

  it('opens on "everything", so nothing is hidden until the user asks', async () => {
    const { result } = await openWithCategories();

    expect(result.current.selectedCategory).toBe(ALL_CATEGORIES);
    expect(result.current.rows).toHaveLength(4); // three prompts and the create row
  });

  it('narrows the list to the picked category', async () => {
    const { result } = await openWithCategories();

    act(() => result.current.selectCategory('c1'));

    expect(result.current.rows.map((row) => (row.kind === 'prompt' ? row.prompt.id : 'create'))).toEqual([
      'g1',
      'create',
    ]);
  });

  it('walks the column with Up and Down once Left has crossed into it', async () => {
    const { result } = await openWithCategories();

    act(() => { result.current.handleKeyDown(keyEvent('ArrowLeft')); });
    expect(result.current.focusedPane).toBe('categories');

    act(() => { result.current.handleKeyDown(keyEvent('ArrowDown')); });
    expect(result.current.selectedCategory).toBe('c1');
  });

  /**
   * Right then Down arrive as two events. Reading the focused column from state
   * would still see "categories" on the second one and change the category
   * instead of moving down the list.
   */
  it('walks the list again as soon as Right has crossed back', async () => {
    const { result } = await openWithCategories();

    act(() => { result.current.handleKeyDown(keyEvent('ArrowLeft')); });
    act(() => { result.current.handleKeyDown(keyEvent('ArrowDown')); });
    expect(result.current.selectedCategory).toBe('c1');

    act(() => { result.current.handleKeyDown(keyEvent('ArrowRight')); });
    act(() => { result.current.handleKeyDown(keyEvent('ArrowDown')); });

    expect(result.current.selectedCategory).toBe('c1');
    expect(result.current.selectedIndex).toBe(1);
  });

  // Left and Right are the composer's own caret movement. Taking them when
  // there is no second column to reach would break typing for everyone who
  // never made a category.
  it('leaves Left and Right alone when there is no column to cross to', async () => {
    categories = [];
    const params = makeParams('!!');
    const { result } = renderLibrary(params);
    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.rows).toHaveLength(4));

    let handled = true;
    act(() => { handled = result.current.handleKeyDown(keyEvent('ArrowLeft')); });
    expect(handled).toBe(false);
  });

  /**
   * `!!` is a fresh search every time. A panel that opened still narrowed to a
   * category chosen ten minutes ago would hide most of the library and say
   * nothing about why.
   */
  it('forgets the narrowing when the panel closes', async () => {
    const { result } = await openWithCategories();

    act(() => result.current.selectCategory('c1'));
    expect(result.current.selectedCategory).toBe('c1');

    act(() => result.current.close());

    expect(result.current.selectedCategory).toBe(ALL_CATEGORIES);
    expect(result.current.focusedPane).toBe('prompts');
  });
});
