import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType } from '@/shared';
import { WorkingDirMissingError } from '../WorkingDirMissingError';

const { bridge, subscribe, dir, focus } = vi.hoisted(() => {
  const listeners = new Map<string, (m: { payload?: Record<string, unknown> }) => void>();
  return {
    bridge: { isConnected: true, send: vi.fn(), listeners },
    // Stable across renders, as the real bridge context's functions are.
    subscribe: (type: string, fn: (m: { payload?: Record<string, unknown> }) => void) => {
      listeners.set(type, fn);
      return () => listeners.delete(type);
    },
    dir: { current: '/proj/a' as string | null },
    focus: { cb: null as null | (() => void) },
  };
});

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ isConnected: bridge.isConnected, send: bridge.send, subscribe }),
}));
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDir: () => ({ workingDirectory: dir.current }),
}));
vi.mock('@/hooks/useOnWindowFocus', () => ({
  useOnWindowFocus: (cb: () => void) => {
    focus.cb = cb;
  },
}));

import { useWorkingDirGone } from '../useWorkingDirGone';

const answer = (payload: Record<string, unknown>) =>
  act(() => bridge.listeners.get(MessageType.WORKING_DIR_STATUS)!({ payload }));

describe('useWorkingDirGone', () => {
  beforeEach(() => {
    bridge.send.mockReset();
    bridge.listeners.clear();
    bridge.isConnected = true;
    dir.current = '/proj/a';
    focus.cb = null;
  });

  it('asks the backend about the folder when the session is opened', () => {
    renderHook(() => useWorkingDirGone(null));

    expect(bridge.send).toHaveBeenCalledWith(MessageType.GET_WORKING_DIR_STATUS, { workingDir: '/proj/a' });
  });

  it('is gone when the backend says so, and not before', () => {
    const { result } = renderHook(() => useWorkingDirGone(null));
    expect(result.current).toBe(false);

    answer({ workingDir: '/proj/a', gone: true });

    expect(result.current).toBe(true);
  });

  it('ignores an answer about a folder the screen has left', () => {
    const { result } = renderHook(() => useWorkingDirGone(null));

    answer({ workingDir: '/proj/other', gone: true });

    expect(result.current).toBe(false);
  });

  it('asks again when the window is returned to, so a restored folder lifts the bar', () => {
    const { result } = renderHook(() => useWorkingDirGone(null));
    answer({ workingDir: '/proj/a', gone: true });
    bridge.send.mockClear();

    act(() => focus.cb!());
    expect(bridge.send).toHaveBeenCalledWith(MessageType.GET_WORKING_DIR_STATUS, { workingDir: '/proj/a' });
    answer({ workingDir: '/proj/a', gone: false });

    expect(result.current).toBe(false);
  });

  it('is gone when a message failed to send because the folder is missing', () => {
    const { result } = renderHook(() => useWorkingDirGone(new WorkingDirMissingError('/proj/a', 'gone')));

    expect(result.current).toBe(true);
  });

  it('does not take any other error for a missing folder', () => {
    const { result } = renderHook(() => useWorkingDirGone(new Error('boom')));

    expect(result.current).toBe(false);
  });

  it('asks nothing without a folder', () => {
    dir.current = null;
    renderHook(() => useWorkingDirGone(null));

    expect(bridge.send).not.toHaveBeenCalled();
  });
});
