import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettledText } from '../useSettledText';

describe('useSettledText', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives the first text at once', () => {
    const { result } = renderHook(({ text }) => useSettledText(text, 160), { initialProps: { text: 'Count l' } });
    expect(result.current).toBe('Count l');
  });

  it('holds the earlier text while the new one is still changing, then gives the one that rested', () => {
    const { result, rerender } = renderHook(({ text }) => useSettledText(text, 160), { initialProps: { text: 'Running a command' } });

    rerender({ text: 'Count l' });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ text: 'Count lines in' });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('Running a command');

    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('Count lines in');
  });

  it('shows the text as it is when there was nothing to settle on before', () => {
    const { result, rerender } = renderHook(({ text }) => useSettledText(text, 160), { initialProps: { text: '' } });
    rerender({ text: 'Reading' });
    expect(result.current).toBe('Reading');
  });
});
