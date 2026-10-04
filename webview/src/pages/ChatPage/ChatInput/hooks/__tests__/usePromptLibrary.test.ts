import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';
import { getCaretOffset, setCaretOffset } from '@/utils/domSelection';
import { ALL_CATEGORIES } from '@/utils/promptCategories';
import { resetPromptOrder } from '@/utils/promptOrderStore';
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
// What the backend says about the order inside each category, per scope.
let orderByCategory: Record<string, Record<string, string[]>> = {};
// When set, GET_PROMPTS answers as the backend does for a library it cannot read.
let failNextReads = false;

const sendMock = vi.fn((type: string, payload?: Record<string, unknown>) => {
  if (type === MessageType.GET_PROMPTS) {
    const scope = payload?.scope;
    if (failNextReads) return Promise.resolve({ status: 'error', error: 'could not be read', scope, prompts: [] });
    return Promise.resolve({
      scope,
      prompts: scope === 'project' ? projectPrompts : globalPrompts,
      orderByCategory: orderByCategory[scope as string] ?? {},
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

function renderLibrary(params: HarnessParams, extra: Record<string, unknown> = {}) {
  return renderHook(
    (props: HarnessParams) =>
      usePromptLibrary({
        ...extra,
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

const keyEvent = (key: string, code = '') =>
  ({ key, code, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.KeyboardEvent<HTMLElement>);

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
    orderByCategory = {};
    failNextReads = false;
    // The arranged order is shared with the library modal and outlives a render.
    resetPromptOrder();
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

  // The arrow keys walk `rows`, and the panel draws in the same order, so the
  // arranged order has to be applied here and not only where the rows are drawn.
  it('lists the prompts in the order the user arranged them', async () => {
    // The backend lists each scope in the library's own order.
    globalPrompts = [prompt('g2', 'two', 'two body'), prompt('g1', 'one', 'one body')];
    projectPrompts = [prompt('p2', 'dos', 'dos body'), prompt('p1', 'uno', 'uno body')];
    const { result } = renderLibrary(makeParams('!!'));

    act(() => result.current.detectPrompt('!!', 2));

    await waitFor(() => expect(result.current.rows).toHaveLength(5));
    expect(result.current.rows.map(row => (row.kind === 'prompt' ? row.prompt.id : 'create'))).toEqual([
      'p2',
      'p1',
      'g2',
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

  // The backend answers a library it cannot read with an error reply, not a
  // rejection. Its empty list must not replace what the panel had, and the order the
  // user arranged must not be overwritten with it.
  it('keeps the prompts it had when a later read comes back as an error', async () => {
    const params = makeParams('!!');
    const { result } = renderLibrary(params);
    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.rows).toHaveLength(3));

    act(() => result.current.detectPrompt('', 0));
    failNextReads = true;
    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows.map(r => (r.kind === 'prompt' ? r.prompt.id : 'create'))).toEqual(['p1', 'g1', 'create']);
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
      const escape = keyEvent('Escape');
      act(() => { handled = result.current.handleKeyDown(escape); });
      expect(handled).toBe(true);
      expect(result.current.isActive).toBe(false);
      // Stopped, so the composer's own listener never reads it as "stop the stream".
      expect(escape.stopPropagation).toHaveBeenCalled();

      act(() => { handled = result.current.handleKeyDown(keyEvent('Enter')); });
      expect(handled).toBe(false);
    });
  });
});

/**
 * Alt with the up and down arrows moves the highlighted row itself, instead of
 * the highlight: the same move a drag makes, for someone not using a pointer.
 */
describe('reordering from the keyboard', () => {
  const category = (id: string, name: string): PromptCategory => ({ id, name, createdAt: 1 });
  const altKey = (key: string) =>
    ({ key, altKey: true, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLElement>);
  const ids = (rows: PromptRow[]) =>
    rows.map((row) => (row.kind === 'prompt' ? row.prompt.id : 'create'));

  beforeEach(() => {
    orderByCategory = {};
    resetPromptOrder();
    sendMock.mockClear();
    categories = [category('c1', 'review'), category('c2', 'docs')];
    globalPrompts = [prompt('g1', 'one', 'one body'), prompt('g2', 'two', 'two body'), prompt('g3', 'three', 'three body')];
    projectPrompts = [];
  });

  async function open() {
    const rendered = renderLibrary(makeParams('!!'));
    act(() => rendered.result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(rendered.result.current.rows).toHaveLength(4));
    return rendered;
  }

  it('moves the highlighted prompt down a step, and the highlight goes with it', async () => {
    const { result } = await open();

    let handled = false;
    act(() => {
      handled = result.current.handleKeyDown(altKey('ArrowDown'));
    });

    expect(handled).toBe(true);
    expect(ids(result.current.rows)).toEqual(['g2', 'g1', 'g3', 'create']);
    expect(result.current.selectedIndex).toBe(1);
  });

  // The screen moves first; the move is then saved by the backend, which owns the order.
  it('saves a moved prompt to the backend, and saves nothing for a plain read', async () => {
    const { result } = await open();
    expect(sendMock.mock.calls.some(([type]) => type === MessageType.REORDER_PROMPTS)).toBe(false);

    act(() => {
      result.current.handleKeyDown(altKey('ArrowDown'));
    });

    expect(sendMock).toHaveBeenCalledWith(MessageType.REORDER_PROMPTS, {
      scope: 'global',
      ids: ['g2', 'g1', 'g3'],
    });
  });

  it('saves a moved category column to the backend', async () => {
    const { result } = await open();
    await waitFor(() => expect(result.current.categoryRows.length).toBeGreaterThan(0));
    act(() => result.current.selectCategory('c1'));

    act(() => {
      result.current.handleKeyDown(altKey('ArrowDown'));
    });

    // "All" is part of the column, so the saved order names it too.
    expect(sendMock).toHaveBeenCalledWith(MessageType.REORDER_PROMPT_CATEGORIES, {
      ids: [ALL_CATEGORIES, 'c2', 'c1'],
    });
  });

  it('moves the highlighted prompt up a step', async () => {
    const { result } = await open();
    act(() => {
      result.current.handleKeyDown(keyEvent('ArrowDown'));
    });
    expect(result.current.selectedIndex).toBe(1);

    act(() => {
      result.current.handleKeyDown(altKey('ArrowUp'));
    });

    expect(ids(result.current.rows)).toEqual(['g2', 'g1', 'g3', 'create']);
    expect(result.current.selectedIndex).toBe(0);
  });

  it('leaves the list and the highlight alone at the top', async () => {
    const { result } = await open();

    act(() => {
      result.current.handleKeyDown(altKey('ArrowUp'));
    });

    expect(ids(result.current.rows)).toEqual(['g1', 'g2', 'g3', 'create']);
    expect(result.current.selectedIndex).toBe(0);
  });

  it('never moves the create row', async () => {
    const { result } = await open();
    act(() => {
      result.current.handleKeyDown(keyEvent('ArrowUp')); // wraps to the create row
    });
    expect(result.current.selectedIndex).toBe(3);

    act(() => {
      result.current.handleKeyDown(altKey('ArrowUp'));
    });

    expect(ids(result.current.rows)).toEqual(['g1', 'g2', 'g3', 'create']);
  });

  it('moves the picked category down the column once the arrows are in it', async () => {
    const { result } = await open();
    await waitFor(() => expect(result.current.categoryRows.length).toBeGreaterThan(0));
    act(() => result.current.selectCategory('c1'));

    act(() => {
      result.current.handleKeyDown(altKey('ArrowDown'));
    });

    expect(result.current.categoryRows.map((row) => row.key)).toEqual([ALL_CATEGORIES, 'c2', 'c1']);
  });

  it('moves "everything" like any other row, since it sorts with the categories', async () => {
    const { result } = await open();
    await waitFor(() => expect(result.current.categoryRows.length).toBeGreaterThan(0));
    act(() => result.current.selectCategory(ALL_CATEGORIES));

    act(() => {
      result.current.handleKeyDown(altKey('ArrowDown'));
    });

    expect(result.current.categoryRows.map((row) => row.key)).toEqual(['c1', ALL_CATEGORIES, 'c2']);
  });

  it('draws "everything" at the place the saved column left it', async () => {
    categories = [
      { ...category('c1', 'review'), priority: -1 },
      { ...category('c2', 'docs'), priority: 1 },
    ];
    const { result } = renderLibrary(makeParams('!!'));
    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.categoryRows.length).toBeGreaterThan(0));

    expect(result.current.categoryRows.map((row) => row.key)).toEqual(['c1', ALL_CATEGORIES, 'c2']);
  });

  // The panel opens on the top row of the column, whichever row that is, and the
  // first prompt of that category is the highlighted one.
  it('opens on the top row of the column, not on "everything"', async () => {
    categories = [
      { ...category('c1', 'review'), priority: -1 },
      { ...category('c2', 'docs'), priority: 1 },
    ];
    globalPrompts = [prompt('g2', 'two', 'two body'), { ...prompt('g1', 'one', 'one body'), categories: ['c1'] }];
    const { result } = renderLibrary(makeParams('!!'));
    act(() => result.current.detectPrompt('!!', 2));

    await waitFor(() => expect(result.current.selectedCategory).toBe('c1'));
    expect(result.current.selectedIndex).toBe(0);
    expect(result.current.rows[0]).toMatchObject({ kind: 'prompt', prompt: { id: 'g1' } });
  });

  it('still opens on "everything" when it is the top row', async () => {
    const { result } = renderLibrary(makeParams('!!'));
    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.categoryRows.length).toBeGreaterThan(0));

    expect(result.current.selectedCategory).toBe(ALL_CATEGORIES);
  });

  it('keeps the category the user is on when the library is read again after a delete', async () => {
    categories = [
      { ...category('c1', 'review'), priority: -1 },
      { ...category('c2', 'docs'), priority: 1 },
    ];
    const { result } = renderLibrary(makeParams('!!'));
    act(() => result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(result.current.selectedCategory).toBe('c1'));
    act(() => result.current.selectCategory('c2'));

    await act(async () => {
      await result.current.deletePrompt({ ...prompt('g2', 'two', 'two body'), scope: 'global' });
    });

    expect(result.current.selectedCategory).toBe('c2');
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
    // The arranged order is shared with the library modal and outlives a render.
    resetPromptOrder();
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

  // A category has an order of its own on top of the library's, so the arrow keys
  // and the drawn list must follow it while that category is picked.
  it('lists a picked category in the category\'s own order', async () => {
    globalPrompts = [
      { ...prompt('g1', 'one', 'one body'), categories: ['c1'] },
      { ...prompt('g2', 'two', 'two body'), categories: ['c1'] },
    ];
    projectPrompts = [];
    orderByCategory = { global: { c1: ['g2', 'g1'] } };
    const { result } = await openWithCategories();

    // Everything: the library's order.
    expect(result.current.rows.map((row) => (row.kind === 'prompt' ? row.prompt.id : 'create'))).toEqual([
      'g1',
      'g2',
      'create',
    ]);

    act(() => result.current.selectCategory('c1'));

    expect(result.current.rows.map((row) => (row.kind === 'prompt' ? row.prompt.id : 'create'))).toEqual([
      'g2',
      'g1',
      'create',
    ]);
    expect(result.current.memberPrompts.map((p) => p.id)).toEqual(['g2', 'g1']);
    expect(result.current.allPrompts.map((p) => p.id).sort()).toEqual(['g1', 'g2']);
  });

  // The arrow keys walk `categoryRows`, and the panel draws the chips in the same
  // order, so the arranged column has to be applied here and not only where the
  // chips are drawn.
  it('lists the chips in the order the user arranged the column', async () => {
    // The backend lists the column in its own order.
    categories = [category('c2', 'docs'), category('c1', 'review')];

    const { result } = await openWithCategories();

    expect(result.current.categoryRows.map((row) => row.key)).toEqual([ALL_CATEGORIES, 'c2', 'c1']);
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


/**
 * Edit and delete from the keyboard. The composer holds the real focus while the
 * panel is open, so `e` and Backspace are also the letters of the query; they are
 * only commands once the user has walked the rows with the arrows.
 */
describe('editing and deleting from the keyboard', () => {
  const category = (id: string, name: string): PromptCategory => ({ id, name, createdAt: 1 });
  const onEditPrompt = vi.fn();
  const onDeletePrompt = vi.fn();
  const onDeleteCategory = vi.fn();

  beforeEach(() => {
    resetPromptOrder();
    sendMock.mockClear();
    for (const fn of [onEditPrompt, onDeletePrompt, onDeleteCategory]) fn.mockClear();
    categories = [category('c1', 'review'), category('c2', 'docs')];
    globalPrompts = [
      { ...prompt('g1', 'one', 'one body'), categories: ['c1'] },
      prompt('g2', 'two', 'two body'),
    ];
    projectPrompts = [];
  });

  async function open() {
    const rendered = renderLibrary(makeParams('!!'), { onEditPrompt, onDeletePrompt, onDeleteCategory });
    act(() => rendered.result.current.detectPrompt('!!', 2));
    await waitFor(() => expect(rendered.result.current.categoryRows.length).toBeGreaterThan(0));
    return rendered;
  }
  const press = (result: { current: { handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => boolean; handleKeyUp: (e: React.KeyboardEvent<HTMLElement>) => boolean } }, key: string, code = '') => {
    let handled = false;
    const event = keyEvent(key, code);
    act(() => { handled = result.current.handleKeyDown(event); });
    // The `e` key opens its edit when it is let go, not when it goes down.
    if (code === 'KeyE' && handled) {
      act(() => { result.current.handleKeyUp(keyEvent(key, code)); });
    }
    return { handled, event };
  };

  describe('before the user has walked the rows', () => {
    it('leaves e, Backspace and Right to the query being typed', async () => {
      const { result } = await open();

      expect(press(result, 'e', 'KeyE').handled).toBe(false);
      expect(press(result, 'Backspace', 'Backspace').handled).toBe(false);
      expect(onEditPrompt).not.toHaveBeenCalled();
      expect(onDeletePrompt).not.toHaveBeenCalled();
    });

    it('hands them back to the query after the user types again', async () => {
      const { result } = await open();
      press(result, 'ArrowDown', 'ArrowDown');
      press(result, 'ArrowUp', 'ArrowUp'); // back on the first row, which a prompt is on
      act(() => result.current.detectPrompt('!!o', 3));
      // The highlight is still on a prompt, so only the typing can be what decides.
      expect(result.current.rows[result.current.selectedIndex]?.kind).toBe('prompt');

      expect(press(result, 'e', 'KeyE').handled).toBe(false);
      expect(onEditPrompt).not.toHaveBeenCalled();
    });

    it('keeps them as commands while the same query is only being re-read', async () => {
      const { result } = await open();
      press(result, 'ArrowDown', 'ArrowDown');
      act(() => result.current.detectPrompt('!!', 2));

      expect(press(result, 'e', 'KeyE').handled).toBe(true);
    });
  });

  // The panel's keys are pressed while the focus is in the composer. Under an IME
  // the `e` key also starts a composition there, and its character (`ㄷ`) ends up
  // next to the `!!` it was meant to act on.
  describe('the character the e key leaves in the composer', () => {
    const composerWith = (text: string) => {
      const element = document.createElement('div');
      element.contentEditable = 'true';
      element.textContent = text;
      document.body.appendChild(element);
      element.focus();
      return element;
    };

    it('is taken back out when the key comes up, before the edit opens', async () => {
      const composer = composerWith('!!');
      const edited = vi.fn();
      document.execCommand = vi.fn(() => {
        composer.textContent = '!!';
        return true;
      });
      const { result } = renderLibrary(makeParams('!!'), { inputRef: { current: composer }, onEditPrompt: edited });
      act(() => result.current.detectPrompt('!!', 2));
      await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(1));
      press(result, 'ArrowDown', 'ArrowDown');

      act(() => { result.current.handleKeyDown(keyEvent('ㄷ', 'KeyE')); });
      composer.textContent = '!!ㄷ'; // the composition the key started, committed
      act(() => { result.current.handleKeyUp(keyEvent('ㄷ', 'KeyE')); });

      expect(composer.textContent).toBe('!!');
      expect(edited).toHaveBeenCalledTimes(1);
    });

    it('leaves a composer alone when the key left nothing in it', async () => {
      const composer = composerWith('!!');
      document.execCommand = vi.fn(() => true);
      const { result } = renderLibrary(makeParams('!!'), { inputRef: { current: composer }, onEditPrompt });
      act(() => result.current.detectPrompt('!!', 2));
      await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(1));
      press(result, 'ArrowDown', 'ArrowDown');

      act(() => { result.current.handleKeyDown(keyEvent('e', 'KeyE')); });
      act(() => { result.current.handleKeyUp(keyEvent('e', 'KeyE')); });

      expect(document.execCommand).not.toHaveBeenCalled();
      expect(composer.textContent).toBe('!!');
    });
  });

  // Focusing a contentEditable puts the caret at its start. With the caret
  // before the `!!`, the `!!` is no longer the token at the caret, the panel stops
  // answering, and the next key is simply typed.
  describe('the caret in the composer after a category edit', () => {
    const composerWithCaretAfterBangs = () => {
      const element = document.createElement('div');
      element.contentEditable = 'true';
      element.tabIndex = 0; // jsdom only focuses what is focusable
      element.textContent = '!!';
      document.body.appendChild(element);
      element.focus();
      setCaretOffset(element, 2);
      return element;
    };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

    it('is put back after the !! when the edit is cancelled', async () => {
      const composer = composerWithCaretAfterBangs();
      const { result } = renderLibrary(makeParams('!!'), { inputRef: { current: composer } });
      act(() => result.current.detectPrompt('!!', 2));
      await waitFor(() => expect(result.current.categoryRows.length).toBeGreaterThan(0));
      press(result, 'ArrowLeft', 'ArrowLeft');
      press(result, 'ArrowDown', 'ArrowDown');
      press(result, 'ㄷ', 'KeyE');
      expect(result.current.editingCategory).toBe('c1');
      composer.blur();
      setCaretOffset(composer, 0); // what focusing it would otherwise leave behind

      act(() => result.current.cancelCategoryEdit());
      await act(async () => { await settle(); });

      expect(document.activeElement).toBe(composer);
      expect(getCaretOffset(composer)).toBe(2);
    });

    it('is put back after the !! when the edit is saved', async () => {
      const composer = composerWithCaretAfterBangs();
      const { result } = renderLibrary(makeParams('!!'), { inputRef: { current: composer } });
      act(() => result.current.detectPrompt('!!', 2));
      await waitFor(() => expect(result.current.categoryRows.length).toBeGreaterThan(0));
      press(result, 'ArrowLeft', 'ArrowLeft');
      press(result, 'ArrowDown', 'ArrowDown');
      press(result, 'ㄷ', 'KeyE');
      composer.blur();
      setCaretOffset(composer, 0);

      await act(async () => {
        await result.current.renameCategory('c1', 'reviews');
        await settle();
      });

      expect(getCaretOffset(composer)).toBe(2);
    });

    it('is put back after the !! when an edit screen closes', async () => {
      const composer = composerWithCaretAfterBangs();
      const { result } = renderLibrary(makeParams('!!'), { inputRef: { current: composer }, onEditPrompt });
      act(() => result.current.detectPrompt('!!', 2));
      await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(1));
      press(result, 'ArrowDown', 'ArrowDown');
      press(result, 'ㄷ', 'KeyE');
      composer.blur();
      setCaretOffset(composer, 0);

      act(() => result.current.returnFocusToComposer());
      await act(async () => { await settle(); });

      expect(document.activeElement).toBe(composer);
      expect(getCaretOffset(composer)).toBe(2);
    });
  });

  describe('a highlighted prompt', () => {
    it('is edited with e, under any layout', async () => {
      const { result } = await open();
      press(result, 'ArrowDown', 'ArrowDown'); // first prompt -> second

      const { handled, event } = press(result, 'ㄷ', 'KeyE');

      expect(handled).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(onEditPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'g2' }));
    });

    it('is edited with the right arrow', async () => {
      const { result } = await open();
      press(result, 'ArrowDown', 'ArrowDown');

      press(result, 'ArrowRight', 'ArrowRight');

      expect(onEditPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'g2' }));
    });

    it('is deleted with Backspace, which only asks: the panel does the deleting after the answer', async () => {
      const { result } = await open();
      press(result, 'ArrowDown', 'ArrowDown');

      press(result, 'Backspace', 'Backspace');

      expect(onDeletePrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'g2' }));
      expect(sendMock.mock.calls.some(([type]) => type === MessageType.DELETE_PROMPT)).toBe(false);
    });

    it('is not edited by e with a modifier held', async () => {
      const { result } = await open();
      press(result, 'ArrowDown', 'ArrowDown');
      const event = { ...keyEvent('e', 'KeyE'), metaKey: true } as unknown as React.KeyboardEvent<HTMLElement>;
      let handled = true;
      act(() => { handled = result.current.handleKeyDown(event); });

      expect(handled).toBe(false);
      expect(onEditPrompt).not.toHaveBeenCalled();
    });

    it('never edits the create row', async () => {
      const { result } = await open();
      press(result, 'ArrowUp', 'ArrowUp'); // wraps to the create row

      press(result, 'e', 'KeyE');

      expect(onEditPrompt).not.toHaveBeenCalled();
    });
  });

  describe('a highlighted category', () => {
    const intoCategories = (result: Parameters<typeof press>[0]) => {
      press(result, 'ArrowLeft', 'ArrowLeft');
      press(result, 'ArrowDown', 'ArrowDown'); // all -> review
    };

    it('goes into edit mode with e or the right arrow', async () => {
      const { result } = await open();
      intoCategories(result);

      press(result, 'ㄷ', 'KeyE');

      expect(result.current.editingCategory).toBe('c1');
    });

    it('does not go into edit mode with the right arrow: it crosses into the rows', async () => {
      const { result } = await open();
      intoCategories(result);

      press(result, 'ArrowRight', 'ArrowRight');

      expect(result.current.editingCategory).toBeNull();
      expect(result.current.focusedPane).toBe('prompts');
    });

    it('is deleted with Backspace, which only asks', async () => {
      const { result } = await open();
      intoCategories(result);

      press(result, 'Backspace', 'Backspace');

      expect(onDeleteCategory).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
      expect(sendMock.mock.calls.some(([type]) => type === MessageType.DELETE_PROMPT_CATEGORY)).toBe(false);
    });

    it('cannot edit or delete "All", and Right still crosses into the rows from it', async () => {
      const { result } = await open();
      press(result, 'ArrowLeft', 'ArrowLeft');

      press(result, 'e', 'KeyE');
      press(result, 'Backspace', 'Backspace');
      expect(result.current.editingCategory).toBeNull();
      expect(onDeleteCategory).not.toHaveBeenCalled();

      press(result, 'ArrowRight', 'ArrowRight');
      expect(result.current.focusedPane).toBe('prompts');
    });
  });

  describe('saving a category name', () => {
    it('sends the new name and shows it, leaving edit mode', async () => {
      const { result } = await open();
      press(result, 'ArrowLeft', 'ArrowLeft');
      press(result, 'ArrowDown', 'ArrowDown');
      press(result, 'e', 'KeyE');
      sendMock.mockImplementationOnce(() =>
        Promise.resolve({ status: 'ok', categories: [category('c1', 'reviews'), category('c2', 'docs')] }),
      );

      await act(async () => {
        await result.current.renameCategory('c1', '  reviews  ');
      });

      expect(sendMock).toHaveBeenCalledWith(MessageType.RENAME_PROMPT_CATEGORY, { id: 'c1', name: 'reviews' });
      expect(result.current.editingCategory).toBeNull();
      expect(result.current.categoryRows.map((row) => row.category?.name)).toContain('reviews');
    });

    it('sends nothing for an unchanged or blank name', async () => {
      const { result } = await open();
      sendMock.mockClear();

      await act(async () => {
        await result.current.renameCategory('c1', 'review');
        await result.current.renameCategory('c1', '   ');
      });

      expect(sendMock.mock.calls.some(([type]) => type === MessageType.RENAME_PROMPT_CATEGORY)).toBe(false);
    });

    it('leaves edit mode and keeps the name when the edit is cancelled', async () => {
      const { result } = await open();
      press(result, 'ArrowLeft', 'ArrowLeft');
      press(result, 'ArrowDown', 'ArrowDown');
      press(result, 'e', 'KeyE');
      expect(result.current.editingCategory).toBe('c1');

      act(() => result.current.cancelCategoryEdit());

      expect(result.current.editingCategory).toBeNull();
      expect(sendMock.mock.calls.some(([type]) => type === MessageType.RENAME_PROMPT_CATEGORY)).toBe(false);
    });
  });

  it('deletes a category, goes back to everything, and re-reads the library', async () => {
    const { result } = await open();
    press(result, 'ArrowLeft', 'ArrowLeft');
    press(result, 'ArrowDown', 'ArrowDown');
    expect(result.current.selectedCategory).toBe('c1');
    sendMock.mockClear();

    await act(async () => {
      await result.current.deleteCategory(category('c1', 'review'));
    });

    expect(sendMock).toHaveBeenCalledWith(MessageType.DELETE_PROMPT_CATEGORY, { id: 'c1' });
    expect(result.current.selectedCategory).toBe(ALL_CATEGORIES);
    expect(sendMock.mock.calls.some(([type]) => type === MessageType.GET_PROMPTS)).toBe(true);
  });
});
