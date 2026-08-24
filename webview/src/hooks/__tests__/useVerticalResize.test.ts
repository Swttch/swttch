import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVerticalResize } from '../useVerticalResize';

function firePointerMove(clientY: number) {
  window.dispatchEvent(new PointerEvent('pointermove', { clientY }));
}

function firePointerUp() {
  window.dispatchEvent(new PointerEvent('pointerup'));
}

function makeStartEvent(clientY: number) {
  return { clientY, preventDefault: () => {} } as unknown as React.PointerEvent;
}

describe('useVerticalResize', () => {
  const OPTIONS = { initialHeight: 800, minHeight: 300, maxHeight: 1000 };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // The hook restores these on unmount too, but a test that asserts mid-drag
    // and never unmounts would otherwise leak into the next test.
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });

  it('starts at initialHeight and not resizing', () => {
    const { result } = renderHook(() => useVerticalResize(OPTIONS));
    expect(result.current.height).toBe(800);
    expect(result.current.isResizing).toBe(false);
  });

  it('grows the height by the drag delta when dragging down', () => {
    const { result } = renderHook(() => useVerticalResize(OPTIONS));

    act(() => result.current.startResize(makeStartEvent(500)));
    expect(result.current.isResizing).toBe(true);

    act(() => firePointerMove(560)); // dragged down 60px
    expect(result.current.height).toBe(860);
  });

  it('shrinks the height when dragging up', () => {
    const { result } = renderHook(() => useVerticalResize(OPTIONS));

    act(() => result.current.startResize(makeStartEvent(500)));
    act(() => firePointerMove(420)); // dragged up 80px

    expect(result.current.height).toBe(720);
  });

  it('clamps to maxHeight when dragged past it', () => {
    const { result } = renderHook(() => useVerticalResize(OPTIONS));

    act(() => result.current.startResize(makeStartEvent(500)));
    act(() => firePointerMove(2000)); // way past max

    expect(result.current.height).toBe(1000);
  });

  it('clamps to minHeight when dragged past it', () => {
    const { result } = renderHook(() => useVerticalResize(OPTIONS));

    act(() => result.current.startResize(makeStartEvent(500)));
    act(() => firePointerMove(-2000)); // way past min

    expect(result.current.height).toBe(300);
  });

  it('stops resizing and further pointer moves have no effect after pointerup', () => {
    const { result } = renderHook(() => useVerticalResize(OPTIONS));

    act(() => result.current.startResize(makeStartEvent(500)));
    act(() => firePointerMove(550));
    expect(result.current.height).toBe(850);

    act(() => firePointerUp());
    expect(result.current.isResizing).toBe(false);

    act(() => firePointerMove(700)); // should be ignored — no active drag
    expect(result.current.height).toBe(850);
  });

  it('sets body user-select/cursor while resizing and restores them after pointerup', () => {
    const { result } = renderHook(() => useVerticalResize(OPTIONS));

    act(() => result.current.startResize(makeStartEvent(500)));
    expect(document.body.style.userSelect).toBe('none');
    expect(document.body.style.cursor).toBe('ns-resize');

    act(() => firePointerUp());
    expect(document.body.style.userSelect).toBe('');
    expect(document.body.style.cursor).toBe('');
  });

  it('a second drag starts from the height the first drag left off, not the original initialHeight', () => {
    const { result } = renderHook(() => useVerticalResize(OPTIONS));

    act(() => result.current.startResize(makeStartEvent(500)));
    act(() => firePointerMove(600)); // +100 -> 900
    act(() => firePointerUp());
    expect(result.current.height).toBe(900);

    act(() => result.current.startResize(makeStartEvent(200)));
    act(() => firePointerMove(150)); // -50 from the new drag's start
    expect(result.current.height).toBe(850);
  });

  it('wasJustResizing() is true right after pointerup, then false again next tick', () => {
    const { result } = renderHook(() => useVerticalResize(OPTIONS));

    expect(result.current.wasJustResizing()).toBe(false);

    act(() => result.current.startResize(makeStartEvent(500)));
    act(() => firePointerMove(560));
    // Marks the drag's tail end so a synthesized click landing on whatever's
    // behind the thin handle — e.g. a modal's click-outside-to-close overlay
    // — can be told apart from a real outside click and ignored.
    act(() => firePointerUp());
    expect(result.current.wasJustResizing()).toBe(true);

    act(() => vi.advanceTimersByTime(0));
    expect(result.current.wasJustResizing()).toBe(false);
  });
});
