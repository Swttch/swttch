import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSecretKnock } from '../useSecretKnock';

/** Clicks carry their own timestamp, which is what the hook measures. */
const clickAt = (knock: (event: { timeStamp: number }) => void, timeStamp: number) => {
  act(() => knock({ timeStamp }));
};

describe('useSecretKnock', () => {
  it('stays shut for a single click', () => {
    const onKnock = vi.fn();
    const { result } = renderHook(() => useSecretKnock(onKnock));

    clickAt(result.current, 1000);
    expect(onKnock).not.toHaveBeenCalled();
  });

  it('stays shut for an ordinary double-click', () => {
    const onKnock = vi.fn();
    const { result } = renderHook(() => useSecretKnock(onKnock));

    clickAt(result.current, 1000);
    clickAt(result.current, 1100);
    expect(onKnock).not.toHaveBeenCalled();
  });

  it('stays shut at three quick clicks', () => {
    const onKnock = vi.fn();
    const { result } = renderHook(() => useSecretKnock(onKnock));

    [1000, 1100, 1200].forEach((t) => clickAt(result.current, t));
    expect(onKnock).not.toHaveBeenCalled();
  });

  it('opens on four quick clicks', () => {
    const onKnock = vi.fn();
    const { result } = renderHook(() => useSecretKnock(onKnock));

    [1000, 1100, 1200, 1300].forEach((t) => clickAt(result.current, t));
    expect(onKnock).toHaveBeenCalledTimes(1);
  });

  it('restarts the count when the rhythm breaks', () => {
    const onKnock = vi.fn();
    const { result } = renderHook(() => useSecretKnock(onKnock));

    clickAt(result.current, 1000);
    clickAt(result.current, 1100);
    // Too long a pause: the next clicks begin a new attempt.
    clickAt(result.current, 3000);
    clickAt(result.current, 3100);
    expect(onKnock).not.toHaveBeenCalled();

    // Two more in rhythm complete that fresh attempt.
    clickAt(result.current, 3200);
    clickAt(result.current, 3300);
    expect(onKnock).toHaveBeenCalledTimes(1);
  });

  it('never adds up from idle clicks spread far apart', () => {
    const onKnock = vi.fn();
    const { result } = renderHook(() => useSecretKnock(onKnock));

    [0, 1000, 2000, 3000, 4000, 5000].forEach((t) => clickAt(result.current, t));
    expect(onKnock).not.toHaveBeenCalled();
  });

  it('needs a fresh four clicks to open a second time', () => {
    const onKnock = vi.fn();
    const { result } = renderHook(() => useSecretKnock(onKnock));

    [1000, 1100, 1200, 1300].forEach((t) => clickAt(result.current, t));
    expect(onKnock).toHaveBeenCalledTimes(1);

    // A fifth click in the same burst must not fire again.
    clickAt(result.current, 1400);
    expect(onKnock).toHaveBeenCalledTimes(1);

    [1500, 1600, 1700].forEach((t) => clickAt(result.current, t));
    expect(onKnock).toHaveBeenCalledTimes(2);
  });
});
