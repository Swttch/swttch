import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const setLevel = vi.fn<(key: string) => Promise<void>>();
const enableUltracode = vi.fn<() => Promise<void>>();
let stored = { current: 'medium', ultracodeAvailable: false, ultracodeEnabled: false };

vi.mock('@/hooks/useEffort', () => ({
  useEffort: () => ({
    supportsEffort: true,
    levels: ['low', 'medium', 'high', 'xhigh', 'max'],
    current: stored.current,
    ultracodeAvailable: stored.ultracodeAvailable,
    ultracodeEnabled: stored.ultracodeEnabled,
    def: { key: stored.current, label: 'Medium', filledDots: 2, totalDots: 5 },
    cycle: vi.fn(),
    setLevel,
    enableUltracode,
  }),
}));

import { EFFORT_STEP_DEBOUNCE_MS, useEffortStepper } from '../useEffortStepper';

beforeEach(() => {
  vi.useFakeTimers();
  setLevel.mockReset().mockResolvedValue(undefined);
  enableUltracode.mockReset().mockResolvedValue(undefined);
  stored = { current: 'medium', ultracodeAvailable: false, ultracodeEnabled: false };
});

afterEach(() => vi.useRealTimers());

describe('useEffortStepper', () => {
  it('starts on the stored step', () => {
    const { result } = renderHook(() => useEffortStepper());
    expect(result.current.index).toBe(1);
    expect(result.current.label).toBe('Medium');
  });

  it('draws the new step at once, before anything is written', () => {
    const { result } = renderHook(() => useEffortStepper());
    act(() => result.current.stepBy(1));
    expect(result.current.index).toBe(2);
    expect(result.current.label).toBe('High');
    expect(setLevel).not.toHaveBeenCalled();
  });

  it('writes once, with the last step, after the presses stop for 500ms', async () => {
    const { result } = renderHook(() => useEffortStepper());
    act(() => result.current.stepBy(1));
    act(() => { vi.advanceTimersByTime(EFFORT_STEP_DEBOUNCE_MS - 1); });
    act(() => result.current.stepBy(1));
    act(() => { vi.advanceTimersByTime(EFFORT_STEP_DEBOUNCE_MS - 1); });
    act(() => result.current.stepBy(1));
    expect(setLevel).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(EFFORT_STEP_DEBOUNCE_MS); });

    expect(EFFORT_STEP_DEBOUNCE_MS).toBe(500);
    expect(setLevel).toHaveBeenCalledTimes(1);
    expect(setLevel).toHaveBeenCalledWith('max');
  });

  it('stops at both ends instead of wrapping', () => {
    stored.current = 'max';
    const { result } = renderHook(() => useEffortStepper());
    act(() => result.current.stepBy(1));
    expect(result.current.index).toBe(4);
    act(() => { result.current.stepBy(-1); result.current.stepBy(-1); result.current.stepBy(-1); result.current.stepBy(-1); result.current.stepBy(-1); });
    expect(result.current.index).toBe(0);
  });

  it('does not write when the presses end where they began', async () => {
    const { result } = renderHook(() => useEffortStepper());
    act(() => result.current.stepBy(1));
    act(() => result.current.stepBy(-1));
    await act(async () => { vi.advanceTimersByTime(EFFORT_STEP_DEBOUNCE_MS); });
    expect(setLevel).not.toHaveBeenCalled();
    expect(result.current.index).toBe(1);
  });

  it('reaches the ultracode step as the top step and enables it', async () => {
    stored = { current: 'max', ultracodeAvailable: true, ultracodeEnabled: false };
    const { result } = renderHook(() => useEffortStepper());
    act(() => result.current.stepBy(1));
    expect(result.current.index).toBe(5);
    expect(result.current.label).toContain('Ultracode');

    await act(async () => { vi.advanceTimersByTime(EFFORT_STEP_DEBOUNCE_MS); });
    expect(enableUltracode).toHaveBeenCalledTimes(1);
    expect(setLevel).not.toHaveBeenCalled();
  });

  it('falls back to the stored step when the write fails', async () => {
    setLevel.mockRejectedValue(new Error('write failed'));
    const { result } = renderHook(() => useEffortStepper());
    act(() => result.current.stepBy(1));
    expect(result.current.index).toBe(2);

    await act(async () => { vi.advanceTimersByTime(EFFORT_STEP_DEBOUNCE_MS); });
    expect(setLevel).toHaveBeenCalledTimes(1);
    expect(result.current.index).toBe(1);
  });

  it('still applies the pending step when its owner closes inside the wait', () => {
    const { result, unmount } = renderHook(() => useEffortStepper());
    act(() => result.current.stepBy(1));
    unmount();
    expect(setLevel).toHaveBeenCalledTimes(1);
    expect(setLevel).toHaveBeenCalledWith('high');
  });
});
