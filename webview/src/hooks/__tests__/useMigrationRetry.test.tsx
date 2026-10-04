import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType } from '@/shared';

const bridge = vi.hoisted(() => ({
  isConnected: true,
  send: vi.fn(),
}));

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => bridge,
}));

import { useMigrationRetry } from '../useMigrationRetry';

const retries = () => bridge.send.mock.calls.filter(([type]) => type === MessageType.RETRY_MIGRATIONS);
// Settled inside act, so the answer to the request it sent has been handled before the test goes on.
const focus = () =>
  act(async () => {
    window.dispatchEvent(new Event('focus'));
  });

describe('useMigrationRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    bridge.isConnected = true;
    bridge.send.mockReset();
    bridge.send.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the button', () => {
    it('asks the backend to run the migrations again, in the running backend', async () => {
      const { result } = renderHook(() => useMigrationRetry(true));

      await act(async () => {
        await result.current.retry();
      });

      expect(bridge.send).toHaveBeenCalledWith(MessageType.RETRY_MIGRATIONS, {});
    });

    it('says it is trying until the backend answers, and ignores a second press meanwhile', async () => {
      let answer: (value: unknown) => void = () => {};
      bridge.send.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
      const { result } = renderHook(() => useMigrationRetry(true));

      act(() => void result.current.retry());
      expect(result.current.retrying).toBe(true);
      act(() => void result.current.retry());
      expect(retries()).toHaveLength(1);

      await act(async () => answer({}));
      expect(result.current.retrying).toBe(false);
    });

    it('can be pressed again when the request could not be answered', async () => {
      bridge.send.mockRejectedValueOnce(new Error('timed out'));
      const { result } = renderHook(() => useMigrationRetry(true));

      await act(async () => {
        await result.current.retry();
      });
      expect(result.current.retrying).toBe(false);

      await act(async () => {
        await result.current.retry();
      });
      expect(retries()).toHaveLength(2);
    });
  });

  describe('coming back to the window', () => {
    it('tries once by itself while a run is failed, with nothing asked of the user', async () => {
      renderHook(() => useMigrationRetry(true));

      await focus();

      expect(retries()).toHaveLength(1);
    });

    it('does not listen when no run is failed', async () => {
      renderHook(() => useMigrationRetry(false));

      await focus();

      expect(retries()).toHaveLength(0);
    });

    it('does not try again within the gap, however often the window flickers, and does after it', async () => {
      renderHook(() => useMigrationRetry(true));

      await focus();
      await focus();
      vi.advanceTimersByTime(10_000);
      await focus();
      expect(retries()).toHaveLength(1);

      vi.advanceTimersByTime(6_000);
      await focus();
      expect(retries()).toHaveLength(2);
    });

    it('does not count the button press as a gap-free chance: a press is followed by the gap too', async () => {
      const { result } = renderHook(() => useMigrationRetry(true));

      await act(async () => {
        await result.current.retry();
      });
      await focus();

      expect(retries()).toHaveLength(1);
    });

    it('stops listening once the run is no longer failed', async () => {
      const { rerender } = renderHook(({ failed }) => useMigrationRetry(failed), { initialProps: { failed: true } });
      rerender({ failed: false });

      await focus();

      expect(retries()).toHaveLength(0);
    });

    it('asks nothing while not connected', async () => {
      bridge.isConnected = false;
      renderHook(() => useMigrationRetry(true));

      await focus();

      expect(retries()).toHaveLength(0);
    });
  });
});
