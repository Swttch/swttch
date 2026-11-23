import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';

const handlers = new Map<string, (message: { payload?: Record<string, unknown> }) => void>();
const sendMock = vi.fn();

vi.mock('../useBridge', () => ({
  useBridge: () => ({
    isConnected: true,
    send: sendMock,
    sendRaw: vi.fn(),
    subscribe: (type: string, handler: (message: { payload?: Record<string, unknown> }) => void) => {
      handlers.set(type, handler);
      return () => handlers.delete(type);
    },
    lastError: null,
  }),
}));

import { useSessionActivity } from '../useSessionActivity';

beforeEach(() => {
  handlers.clear();
  sendMock.mockReset();
});

// A tab of one IDE window's backend watches sessions whose CLI the backend of another window holds (#711): it hands
// what the person does there over instead of acting itself, and says so only for sessions such a backend holds.
describe('useSessionActivity: heldElsewhere', () => {
  it('reads the sessions held by another window\'s backend when it mounts', async () => {
    sendMock.mockResolvedValue({ status: 'ok', activity: { s1: 'running' }, open: ['s1'], heldElsewhere: ['s1'] });

    const { result } = renderHook(() => useSessionActivity());

    await waitFor(() => expect(result.current.heldElsewhere.has('s1')).toBe(true));
    expect(sendMock).toHaveBeenCalledWith(MessageType.GET_SESSION_ACTIVITY, {});
  });

  it('follows the announcements: a session joins it, and leaves it', async () => {
    sendMock.mockResolvedValue({ status: 'ok', activity: {}, open: [] });
    const { result } = renderHook(() => useSessionActivity());
    await waitFor(() => expect(handlers.has(MessageType.SESSION_ACTIVITY_CHANGED)).toBe(true));

    act(() => handlers.get(MessageType.SESSION_ACTIVITY_CHANGED)!({ payload: { activity: {}, open: [], heldElsewhere: ['s2'] } }));
    expect([...result.current.heldElsewhere]).toEqual(['s2']);

    act(() => handlers.get(MessageType.SESSION_ACTIVITY_CHANGED)!({ payload: { activity: {}, open: [], heldElsewhere: [] } }));
    expect([...result.current.heldElsewhere]).toEqual([]);
  });

  it('holds none when a backend too old to say sends none', async () => {
    sendMock.mockResolvedValue({ status: 'ok', activity: {}, open: [] });
    const { result } = renderHook(() => useSessionActivity());
    await waitFor(() => expect(handlers.has(MessageType.SESSION_ACTIVITY_CHANGED)).toBe(true));

    act(() => handlers.get(MessageType.SESSION_ACTIVITY_CHANGED)!({ payload: { activity: {}, open: ['x'] } }));

    expect(result.current.heldElsewhere.size).toBe(0);
  });
});
