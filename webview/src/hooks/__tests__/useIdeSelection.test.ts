import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType } from '@/shared';

// ---------------------------------------------------------------------------
// BridgeContext mock — captures the IDE_SELECTION handler so tests can drive it
// directly, mirroring how the backend would push a message.
// ---------------------------------------------------------------------------

type Handler = (message: IPCMessage) => void;

const handlers = new Map<string, Handler>();
const unsubscribeMock = vi.fn();

const subscribeMock = vi.fn((type: string, handler: Handler) => {
  handlers.set(type, handler);
  return unsubscribeMock;
});

function emitIdeSelection(payload: Record<string, unknown>) {
  const handler = handlers.get(MessageType.IDE_SELECTION);
  if (!handler) throw new Error('IDE_SELECTION handler not registered');
  handler({ type: MessageType.IDE_SELECTION, payload, timestamp: Date.now() });
}

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: vi.fn(),
    subscribe: subscribeMock,
    lastError: null,
  }),
}));

import { useIdeSelection, parseIdeSelectionPayload } from '../useIdeSelection';

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
});

// ---------------------------------------------------------------------------
// parseIdeSelectionPayload
// ---------------------------------------------------------------------------

describe('parseIdeSelectionPayload', () => {
  it('parses a full selection payload', () => {
    expect(
      parseIdeSelectionPayload({
        absolutePath: '/work/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: 1,
        endLine: 5,
        selectedText: 'code',
        workingDir: '/work',
      }),
    ).toEqual({
      absolutePath: '/work/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 1,
      endLine: 5,
      selectedText: 'code',
      workingDir: '/work',
      isGitignored: false,
    });
  });

  it('normalises a file-only payload (null lines/text)', () => {
    expect(
      parseIdeSelectionPayload({
        absolutePath: '/work/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: null,
        endLine: null,
        selectedText: null,
        workingDir: '/work',
      }),
    ).toMatchObject({ startLine: null, endLine: null, selectedText: null });
  });

  it('returns null when relativePath is missing', () => {
    expect(
      parseIdeSelectionPayload({ workingDir: '/work' }),
    ).toBeNull();
  });

  it('returns null when workingDir is missing', () => {
    expect(
      parseIdeSelectionPayload({ relativePath: 'src/file.ts' }),
    ).toBeNull();
  });

  it('normalises isGitignored: true when provided as boolean true', () => {
    const result = parseIdeSelectionPayload({
      absolutePath: '/work/dist/bundle.js',
      relativePath: 'dist/bundle.js',
      startLine: 1,
      endLine: 5,
      selectedText: 'code',
      workingDir: '/work',
      isGitignored: true,
    });
    expect(result?.isGitignored).toBe(true);
  });

  it('normalises isGitignored: false when provided as boolean false', () => {
    const result = parseIdeSelectionPayload({
      absolutePath: '/work/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: null,
      endLine: null,
      selectedText: null,
      workingDir: '/work',
      isGitignored: false,
    });
    expect(result?.isGitignored).toBe(false);
  });

  it('defaults isGitignored to false when field is absent', () => {
    const result = parseIdeSelectionPayload({
      absolutePath: '/work/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: null,
      endLine: null,
      selectedText: null,
      workingDir: '/work',
    });
    expect(result?.isGitignored).toBe(false);
  });

  it('defaults isGitignored to false when field is a non-boolean value', () => {
    const result = parseIdeSelectionPayload({
      absolutePath: '/work/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: null,
      endLine: null,
      selectedText: null,
      workingDir: '/work',
      isGitignored: 'yes',
    });
    expect(result?.isGitignored).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useIdeSelection — handler
// ---------------------------------------------------------------------------

describe('useIdeSelection', () => {
  it('registers and cleans up the IDE_SELECTION subscription', () => {
    const { unmount } = renderHook(() => useIdeSelection({ currentWorkingDir: '/work' }));
    expect(subscribeMock).toHaveBeenCalledWith(MessageType.IDE_SELECTION, expect.any(Function));
    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it('exposes the latest selection for the current working dir', () => {
    const { result } = renderHook(() => useIdeSelection({ currentWorkingDir: '/work' }));
    expect(result.current.currentSelection).toBeNull();

    act(() => {
      emitIdeSelection({
        absolutePath: '/work/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: 42,
        endLine: 51,
        selectedText: 'code',
        workingDir: '/work',
      });
    });

    expect(result.current.currentSelection).toMatchObject({
      relativePath: 'src/file.ts',
      startLine: 42,
      endLine: 51,
    });
  });

  it('ignores payloads from a different working directory', () => {
    const { result } = renderHook(() => useIdeSelection({ currentWorkingDir: '/work' }));

    act(() => {
      emitIdeSelection({
        absolutePath: '/other/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: 1,
        endLine: 2,
        selectedText: 'code',
        workingDir: '/other',
      });
    });

    expect(result.current.currentSelection).toBeNull();
  });

  it('matches working dir regardless of trailing slash', () => {
    const { result } = renderHook(() => useIdeSelection({ currentWorkingDir: '/work/' }));

    act(() => {
      emitIdeSelection({
        absolutePath: '/work/src/file.ts',
        relativePath: 'src/file.ts',
        startLine: null,
        endLine: null,
        selectedText: null,
        workingDir: '/work',
      });
    });

    expect(result.current.currentSelection).toMatchObject({ relativePath: 'src/file.ts' });
  });

  it('replaces an earlier selection with a newer one', () => {
    const { result } = renderHook(() => useIdeSelection({ currentWorkingDir: '/work' }));

    act(() => {
      emitIdeSelection({
        absolutePath: '/work/src/a.ts',
        relativePath: 'src/a.ts',
        startLine: 1,
        endLine: 2,
        selectedText: 'a',
        workingDir: '/work',
      });
    });
    act(() => {
      emitIdeSelection({
        absolutePath: '/work/src/b.ts',
        relativePath: 'src/b.ts',
        startLine: null,
        endLine: null,
        selectedText: null,
        workingDir: '/work',
      });
    });

    expect(result.current.currentSelection?.relativePath).toBe('src/b.ts');
  });

  /**
   * Closing the last editor tab has to be able to empty the chip.
   *
   * A diff tab opened for a proposed edit left "Diff: cart.js" sitting in the
   * composer after it closed: nothing was focused afterwards, so no push
   * followed and the chip kept naming a tab that was gone. An empty
   * relativePath is how the IDE says "nothing is open now".
   */
  it('clears the selection when the IDE reports no open file', () => {
    const { result } = renderHook(() => useIdeSelection({ currentWorkingDir: '/work' }));

    act(() => {
      emitIdeSelection({
        absolutePath: '/work/src/a.ts',
        relativePath: 'src/a.ts',
        startLine: null,
        endLine: null,
        selectedText: null,
        workingDir: '/work',
      });
    });
    expect(result.current.currentSelection?.relativePath).toBe('src/a.ts');

    act(() => {
      emitIdeSelection({
        absolutePath: '',
        relativePath: '',
        startLine: null,
        endLine: null,
        selectedText: null,
        workingDir: '/work',
      });
    });

    expect(result.current.currentSelection).toBeNull();
  });

  it('ignores an empty-path push from a different working directory', () => {
    // The clear is still scoped: another project's IDE must not blank this
    // composer's chip.
    const { result } = renderHook(() => useIdeSelection({ currentWorkingDir: '/work' }));

    act(() => {
      emitIdeSelection({
        absolutePath: '/work/src/a.ts',
        relativePath: 'src/a.ts',
        startLine: null,
        endLine: null,
        selectedText: null,
        workingDir: '/work',
      });
    });
    act(() => {
      emitIdeSelection({
        absolutePath: '',
        relativePath: '',
        startLine: null,
        endLine: null,
        selectedText: null,
        workingDir: '/elsewhere',
      });
    });

    expect(result.current.currentSelection?.relativePath).toBe('src/a.ts');
  });
});
