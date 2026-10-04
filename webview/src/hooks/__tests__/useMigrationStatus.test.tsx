import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType } from '@/shared';

const bridge = vi.hoisted(() => ({
  isConnected: true,
  send: vi.fn(),
  listeners: new Map<string, Array<(message: { payload?: Record<string, unknown> }) => void>>(),
  subscribe: vi.fn(),
}));

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => bridge,
}));

import { useMigrationStatus } from '../useMigrationStatus';

const push = (payload: Record<string, unknown>) =>
  act(() => {
    for (const listener of bridge.listeners.get(MessageType.MIGRATION_STATUS) ?? []) listener({ payload });
  });

describe('useMigrationStatus', () => {
  beforeEach(() => {
    bridge.isConnected = true;
    bridge.send.mockReset();
    bridge.listeners.clear();
    bridge.subscribe.mockReset();
    bridge.subscribe.mockImplementation((type: string, listener: (message: { payload?: Record<string, unknown> }) => void) => {
      bridge.listeners.set(type, [...(bridge.listeners.get(type) ?? []), listener]);
      return () => bridge.listeners.set(type, (bridge.listeners.get(type) ?? []).filter((l) => l !== listener));
    });
  });

  it('is idle until the backend says otherwise', () => {
    const { result } = renderHook(() => useMigrationStatus());

    expect(result.current).toEqual({ status: 'idle', failedMigration: null, unreadable: [] });
  });

  it('asks for the current state once connected, since a window that opens late missed the push', () => {
    renderHook(() => useMigrationStatus());

    expect(bridge.send).toHaveBeenCalledWith(MessageType.GET_MIGRATION_STATUS, {});
  });

  it('asks nothing while not connected', () => {
    bridge.isConnected = false;

    renderHook(() => useMigrationStatus());

    expect(bridge.send).not.toHaveBeenCalled();
    expect(bridge.subscribe).not.toHaveBeenCalled();
  });

  it('follows a run that started, failed, and the folders it left unread', () => {
    const { result } = renderHook(() => useMigrationStatus());

    push({ status: 'running', due: ['a'] });
    expect(result.current.status).toBe('running');

    push({ status: 'failed', failedMigration: 'm1', reason: 'boom' });
    expect(result.current).toEqual({ status: 'failed', failedMigration: 'm1', unreadable: [] });

    push({ status: 'done', unreadable: ['/a', 5, '/b'] });
    expect(result.current).toEqual({ status: 'done', failedMigration: null, unreadable: ['/a', '/b'] });
  });

  it('goes back to idle when the backend says so', () => {
    const { result } = renderHook(() => useMigrationStatus());
    push({ status: 'running' });

    push({ status: 'idle' });

    expect(result.current.status).toBe('idle');
  });

  it('reads an unknown state as idle rather than guessing', () => {
    const { result } = renderHook(() => useMigrationStatus());

    push({ status: 'something-new' });

    expect(result.current.status).toBe('idle');
  });

  it('stops listening when the component goes away', () => {
    const { unmount } = renderHook(() => useMigrationStatus());

    unmount();

    expect(bridge.listeners.get(MessageType.MIGRATION_STATUS)).toEqual([]);
  });

  describe('folders that could not be read', () => {
    const retries = () => bridge.send.mock.calls.filter(([type]) => type === MessageType.RETRY_UNREAD_FOLDERS);
    const focus = () => act(() => void window.dispatchEvent(new Event('focus')));

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('are read again by the backend when the window becomes active, which is how allowing access in the system settings takes effect', () => {
      renderHook(() => useMigrationStatus());
      push({ status: 'done', unreadable: ['/a'] });

      focus();

      expect(retries()).toHaveLength(1);
    });

    it('are not asked about when nothing is unread', () => {
      renderHook(() => useMigrationStatus());
      push({ status: 'running', due: ['m'] });

      focus();

      expect(retries()).toHaveLength(0);
    });

    it('stop being asked about once the backend says they are read', () => {
      renderHook(() => useMigrationStatus());
      push({ status: 'done', unreadable: ['/a'] });
      push({ status: 'idle' });

      focus();

      expect(retries()).toHaveLength(0);
    });

    it('are not asked about again within a few seconds, however often the window flickers', () => {
      renderHook(() => useMigrationStatus());
      push({ status: 'done', unreadable: ['/a'] });

      focus();
      focus();
      vi.advanceTimersByTime(2_000);
      focus();
      expect(retries()).toHaveLength(1);

      vi.advanceTimersByTime(4_000);
      focus();
      expect(retries()).toHaveLength(2);
    });
  });
});
