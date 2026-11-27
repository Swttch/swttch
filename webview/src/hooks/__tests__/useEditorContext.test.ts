import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { setCaretOffset } from '@/utils/domSelection';
import { MessageType } from '@/shared';

// ---------------------------------------------------------------------------
// BridgeContext mock — captures the EDITOR_CONTEXT handler so tests can
// drive it directly, mirroring how the backend would push a message.
// ---------------------------------------------------------------------------

type Handler = (message: IPCMessage) => void;

const handlers = new Map<string, Handler>();
const unsubscribeMock = vi.fn();

const subscribeMock = vi.fn((type: string, handler: Handler) => {
  handlers.set(type, handler);
  return unsubscribeMock;
});

function emitEditorContext(payload: Record<string, unknown>) {
  const handler = handlers.get(MessageType.EDITOR_CONTEXT);
  if (!handler) throw new Error('EDITOR_CONTEXT handler not registered');
  handler({ type: MessageType.EDITOR_CONTEXT, payload, timestamp: Date.now() });
}

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: vi.fn(),
    subscribe: subscribeMock,
    lastError: null,
  }),
}));

// Imported AFTER vi.mock so the mock is wired up first.
import {
  useEditorContext,
  buildEditorContextText,
  insertAtCursor,
} from '../useEditorContext';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Pure helper: buildEditorContextText
// ---------------------------------------------------------------------------

describe('buildEditorContextText', () => {
  it('quotes a path with a space, line range included, as the CLI reads it (#708)', () => {
    expect(buildEditorContextText({ relativePath: 'docs/my file.md', startLine: 3, endLine: 5 } as never)).toBe(
      '@"docs/my file.md#L3-L5"',
    );
  });

  it('prefixes @ and appends #L range when both start and end lines are numbers', () => {
    expect(
      buildEditorContextText({
        absolutePath: '/abs/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: 10,
        endLine: 25,
        workingDir: '/abs',
      }),
    ).toBe('@src/file.ts#L10-L25');
  });

  it('returns @relativePath only when there is no selection (endLine null)', () => {
    expect(
      buildEditorContextText({
        absolutePath: '/abs/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: 10,
        endLine: null,
        workingDir: '/abs',
      }),
    ).toBe('@src/file.ts');
  });

  it('returns @relativePath only when startLine is null', () => {
    expect(
      buildEditorContextText({
        absolutePath: '/abs/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: null,
        endLine: 25,
        workingDir: '/abs',
      }),
    ).toBe('@src/file.ts');
  });
});

// ---------------------------------------------------------------------------
// Pure helper: insertAtCursor
// ---------------------------------------------------------------------------

describe('insertAtCursor', () => {
  it('inserts text at a mid-string cursor, preserving before/after text', () => {
    const { nextValue, nextCaret } = insertAtCursor('hello world', 'X', 5);
    expect(nextValue).toBe('helloX world');
    expect(nextCaret).toBe(6);
  });

  it('inserts at the end when cursor equals value length', () => {
    const { nextValue, nextCaret } = insertAtCursor('abc', 'src/file.ts ', 3);
    expect(nextValue).toBe('abcsrc/file.ts ');
    expect(nextCaret).toBe(15);
  });

  it('inserts at the start when cursor is 0', () => {
    const { nextValue, nextCaret } = insertAtCursor('abc', 'X ', 0);
    expect(nextValue).toBe('X abc');
    expect(nextCaret).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Hook integration
// ---------------------------------------------------------------------------

interface HarnessParams {
  value: string;
  currentWorkingDir: string;
  cursor?: number;
  onInsertToken?: (token: string) => void;
}

/**
 * Build a real contentEditable composer div mirroring RichInput: text content
 * set to `value`, the caret placed at `cursor` (defaults to end). Mounted in the
 * document so window.getSelection() / getCaretOffset reflect a real caret.
 */
function makeComposer(value: string, cursor: number): HTMLDivElement {
  const el = document.createElement('div');
  el.contentEditable = 'plaintext-only';
  el.textContent = value;
  document.body.appendChild(el);
  el.focus();
  setCaretOffset(el, cursor);
  return el;
}

function renderEditorContext(params: HarnessParams, onChange: (next: string) => void) {
  const composer = makeComposer(params.value, params.cursor ?? params.value.length);
  const result = renderHook(() => {
    const textareaRef = useRef<HTMLDivElement>(composer);
    useEditorContext({
      value: params.value,
      onChange,
      textareaRef,
      currentWorkingDir: params.currentWorkingDir,
      shouldFocus: false,
      onInsertToken: params.onInsertToken,
    });
    return { textareaRef };
  });
  return result;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useEditorContext — handler', () => {
  it('registers and cleans up the EDITOR_CONTEXT subscription', () => {
    const onChange = vi.fn();
    const { unmount } = renderEditorContext(
      { value: '', currentWorkingDir: '/work' },
      onChange,
    );
    expect(subscribeMock).toHaveBeenCalledWith(MessageType.EDITOR_CONTEXT, expect.any(Function));
    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it('inserts "@relativePath#L.. " with trailing space at cursor on selection', () => {
    const onChange = vi.fn();
    // Cursor sits between "ab" and "cd"; inserted text keeps both sides intact.
    renderEditorContext(
      { value: 'abcd', currentWorkingDir: '/work', cursor: 2 },
      onChange,
    );

    act(() => {
      emitEditorContext({
        absolutePath: '/work/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: 10,
        endLine: 25,
        workingDir: '/work',
      });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ab@src/file.ts#L10-L25 cd');
  });

  it('inserts @relativePath only when there is no selection', () => {
    const onChange = vi.fn();
    renderEditorContext({ value: '', currentWorkingDir: '/work' }, onChange);

    act(() => {
      emitEditorContext({
        absolutePath: '/work/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: null,
        endLine: null,
        workingDir: '/work',
      });
    });

    expect(onChange).toHaveBeenCalledWith('@src/file.ts ');
  });

  it('fires onInsertToken with the @ token (no trailing space) on a selection', () => {
    const onChange = vi.fn();
    const onInsertToken = vi.fn();
    renderEditorContext(
      { value: '', currentWorkingDir: '/work', onInsertToken },
      onChange,
    );

    act(() => {
      emitEditorContext({
        absolutePath: '/work/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: 10,
        endLine: 25,
        workingDir: '/work',
      });
    });

    expect(onInsertToken).toHaveBeenCalledTimes(1);
    expect(onInsertToken).toHaveBeenCalledWith('@src/file.ts#L10-L25');
  });

  it('fires onInsertToken with @relativePath when there is no selection', () => {
    const onChange = vi.fn();
    const onInsertToken = vi.fn();
    renderEditorContext(
      { value: '', currentWorkingDir: '/work', onInsertToken },
      onChange,
    );

    act(() => {
      emitEditorContext({
        absolutePath: '/work/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: null,
        endLine: null,
        workingDir: '/work',
      });
    });

    expect(onInsertToken).toHaveBeenCalledWith('@src/file.ts');
  });

  it('does not fire onInsertToken when the payload is ignored (wrong workingDir)', () => {
    const onChange = vi.fn();
    const onInsertToken = vi.fn();
    renderEditorContext(
      { value: '', currentWorkingDir: '/work', onInsertToken },
      onChange,
    );

    act(() => {
      emitEditorContext({
        absolutePath: '/other/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: 1,
        endLine: 2,
        workingDir: '/other',
      });
    });

    expect(onInsertToken).not.toHaveBeenCalled();
  });

  it('ignores payloads whose workingDir does not match currentWorkingDir', () => {
    const onChange = vi.fn();
    renderEditorContext({ value: '', currentWorkingDir: '/work' }, onChange);

    act(() => {
      emitEditorContext({
        absolutePath: '/other/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: 1,
        endLine: 2,
        workingDir: '/other',
      });
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('matches workingDir regardless of trailing slash differences', () => {
    const onChange = vi.fn();
    renderEditorContext({ value: '', currentWorkingDir: '/work/' }, onChange);

    act(() => {
      emitEditorContext({
        absolutePath: '/work/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: null,
        endLine: null,
        workingDir: '/work',
      });
    });

    expect(onChange).toHaveBeenCalledWith('@src/file.ts ');
  });

  it('ignores payloads missing relativePath', () => {
    const onChange = vi.fn();
    renderEditorContext({ value: '', currentWorkingDir: '/work' }, onChange);

    act(() => {
      emitEditorContext({
        absolutePath: '/work/src/file.ts',
        startLine: 1,
        endLine: 2,
        workingDir: '/work',
      });
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('dedups identical payloads fired within 500ms (only one onChange)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onChange = vi.fn();
    renderEditorContext({ value: '', currentWorkingDir: '/work' }, onChange);

    const payload = {
      absolutePath: '/work/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 10,
      endLine: 25,
      workingDir: '/work',
    };

    act(() => {
      emitEditorContext(payload);
      vi.setSystemTime(200);
      emitEditorContext(payload);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('allows the same payload again after 500ms', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onChange = vi.fn();
    renderEditorContext({ value: '', currentWorkingDir: '/work' }, onChange);

    const payload = {
      absolutePath: '/work/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 10,
      endLine: 25,
      workingDir: '/work',
    };

    act(() => {
      emitEditorContext(payload);
      vi.setSystemTime(600);
      emitEditorContext(payload);
    });

    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
