import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';
import type { SavedPrompt } from '@/types/prompt';

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

const sendMock = vi.fn((type: string, payload?: Record<string, unknown>) => {
  if (type === MessageType.GET_PROMPTS) {
    const scope = payload?.scope;
    return Promise.resolve({
      scope,
      prompts: scope === 'project' ? projectPrompts : globalPrompts,
    });
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
import {
  usePromptLibrary,
  firstSelectableIndex,
  stepSelection,
  type PromptRow,
} from '../usePromptLibrary';

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
    const keyEvent = (key: string) =>
      ({ key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLElement>);

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

/**
 * Category headings are drawn between the prompts but are not rows anyone can
 * pick, so the two helpers that move the highlight have to step over them.
 */
describe('selection skips category headings', () => {
  const heading = (category: string | null): PromptRow => ({ kind: 'heading', category });
  const promptRow = (id: string): PromptRow => ({
    kind: 'prompt',
    prompt: { id, name: id, content: id, scope: 'global', createdAt: 1, updatedAt: 1 },
  });

  it('opens on the first prompt, not on the heading above it', () => {
    expect(firstSelectableIndex([heading('a'), promptRow('p1')])).toBe(1);
  });

  it('opens on index 0 when there is nothing to select', () => {
    expect(firstSelectableIndex([heading('a')])).toBe(0);
    expect(firstSelectableIndex([])).toBe(0);
  });

  it('steps past a heading on the way down', () => {
    const rows = [promptRow('p1'), heading('b'), promptRow('p2')];
    expect(stepSelection(rows, 0, 1)).toBe(2);
  });

  it('steps past a heading on the way up', () => {
    const rows = [promptRow('p1'), heading('b'), promptRow('p2')];
    expect(stepSelection(rows, 2, -1)).toBe(0);
  });

  it('wraps around the ends', () => {
    const rows = [heading('a'), promptRow('p1'), promptRow('p2')];
    expect(stepSelection(rows, 2, 1)).toBe(1);
    expect(stepSelection(rows, 1, -1)).toBe(2);
  });

  // A list of nothing but headings has nowhere to go, and must not spin.
  it('stays put when no row is selectable', () => {
    expect(stepSelection([heading('a'), heading('b')], 0, 1)).toBe(0);
  });
});
