import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStash } from '../useStash';

/**
 * Ctrl keydowns are dispatched with an explicit timeStamp, since the hook
 * measures the gap between presses from the event itself.
 */
const pressCtrl = (timeStamp: number, init: KeyboardEventInit = {}) => {
  act(() => {
    const event = new KeyboardEvent('keydown', { key: 'Control', ...init });
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    window.dispatchEvent(event);
  });
};

const doubleTap = (at: number) => {
  pressCtrl(at);
  pressCtrl(at + 100);
};

describe('useStash', () => {
  it('starts out playing', () => {
    const { result } = renderHook(() => useStash());
    expect(result.current.state).toBe('playing');
  });

  it('hides the game on a Ctrl double-tap', () => {
    const { result } = renderHook(() => useStash());
    doubleTap(1000);
    expect(result.current.state).toBe('hidden');
  });

  it('ignores single presses spaced too far apart', () => {
    const { result } = renderHook(() => useStash());
    pressCtrl(1000);
    pressCtrl(2000);
    expect(result.current.state).toBe('playing');
  });

  it('brings the game back paused rather than running', () => {
    const { result } = renderHook(() => useStash());
    doubleTap(1000);
    doubleTap(3000);

    // Revealed, but deliberately not resumed — Space does that.
    expect(result.current.state).toBe('paused');
  });

  it('can stash again from a visible pause', () => {
    const { result } = renderHook(() => useStash());
    doubleTap(1000);
    doubleTap(3000);
    doubleTap(5000);
    expect(result.current.state).toBe('hidden');
  });

  it('resumes from a visible pause', () => {
    const { result } = renderHook(() => useStash());
    doubleTap(1000);
    doubleTap(3000);

    act(() => result.current.resume());
    expect(result.current.state).toBe('playing');
  });

  it('cannot be resumed while hidden, so a stray key never exposes it', () => {
    const { result } = renderHook(() => useStash());
    doubleTap(1000);

    act(() => result.current.resume());
    expect(result.current.state).toBe('hidden');
  });

  it('reveals a hidden game on request, for a click on Dorongi', () => {
    const { result } = renderHook(() => useStash());
    doubleTap(1000);

    act(() => result.current.reveal());
    expect(result.current.state).toBe('paused');
  });

  it('leaves a running game alone when reveal is called', () => {
    const { result } = renderHook(() => useStash());
    act(() => result.current.reveal());
    expect(result.current.state).toBe('playing');
  });

  it('ignores Ctrl pressed as part of a chord, so IDE shortcuts still work', () => {
    const { result } = renderHook(() => useStash());
    pressCtrl(1000, { shiftKey: true });
    pressCtrl(1100, { shiftKey: true });
    expect(result.current.state).toBe('playing');
  });

  it('stops listening once unmounted', () => {
    const { result, unmount } = renderHook(() => useStash());
    unmount();
    doubleTap(1000);
    expect(result.current.state).toBe('playing');
  });
});
