import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType } from '@/shared';

// ── Mutable test context read by the mocked contexts ─────────────────────────
const ctx = {
  currentSessionId: 'sess-a' as string | null,
  inputMode: 'ask_before_edit',
};

type Handler = (message: { type: string; payload: Record<string, unknown>; timestamp: number }) => void;
const handlers = new Map<string, Handler>();
const unsubscribe = vi.fn();
const subscribeMock = vi.fn((type: string, handler: Handler) => {
  handlers.set(type, handler);
  return unsubscribe;
});
const sendMock = vi.fn(() => Promise.resolve({}));
const sendMessageMock = vi.fn();
const navigateToSessionMock = vi.fn((sessionId: string) => {
  // Emulate the router making the navigated session current.
  ctx.currentSessionId = sessionId;
});

function emit(type: string, payload: Record<string, unknown>) {
  const h = handlers.get(type);
  if (!h) throw new Error(`no handler for ${type}`);
  act(() => h({ type, payload, timestamp: 0 }));
}

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send: sendMock, subscribe: subscribeMock }),
}));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    currentSessionId: ctx.currentSessionId,
    inputMode: ctx.inputMode,
    navigateToSession: navigateToSessionMock,
  }),
}));
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ sendMessage: sendMessageMock }),
}));

import { useScheduledDelivery } from '../useScheduledDelivery';

beforeEach(() => {
  handlers.clear();
  sendMock.mockClear();
  sendMessageMock.mockClear();
  navigateToSessionMock.mockClear();
  ctx.currentSessionId = 'sess-a';
  ctx.inputMode = 'ask_before_edit';
});

describe('useScheduledDelivery', () => {
  it('subscribes to DELIVER_SCHEDULED_MESSAGE', () => {
    renderHook(() => useScheduledDelivery());
    expect(subscribeMock).toHaveBeenCalledWith(MessageType.DELIVER_SCHEDULED_MESSAGE, expect.any(Function));
  });

  it('delivers immediately (no switch) and ACKs when already on the session', () => {
    renderHook(() => useScheduledDelivery());
    emit(MessageType.DELIVER_SCHEDULED_MESSAGE, {
      id: 'r1',
      sessionId: 'sess-a',
      message: 'ping later',
      needsSessionSwitch: false,
    });
    expect(navigateToSessionMock).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith('ping later', 'ask_before_edit');
    expect(sendMock).toHaveBeenCalledWith(MessageType.SCHEDULED_MESSAGE_DELIVERED, {
      id: 'r1',
      sessionId: 'sess-a',
    });
  });

  it('switches session first, then delivers + ACKs once it becomes current', () => {
    const { rerender } = renderHook(() => useScheduledDelivery());
    emit(MessageType.DELIVER_SCHEDULED_MESSAGE, {
      id: 'r2',
      sessionId: 'sess-b',
      message: 'switch then send',
      needsSessionSwitch: true,
    });
    // Navigation was requested; the send waits for the switch to land.
    expect(navigateToSessionMock).toHaveBeenCalledWith('sess-b');
    // navigateToSessionMock set ctx.currentSessionId = 'sess-b'; re-render so the
    // effect sees the new current session and completes the pending delivery.
    act(() => rerender());
    expect(sendMessageMock).toHaveBeenCalledWith('switch then send', 'ask_before_edit');
    expect(sendMock).toHaveBeenCalledWith(MessageType.SCHEDULED_MESSAGE_DELIVERED, {
      id: 'r2',
      sessionId: 'sess-b',
    });
  });

  it('does not switch when needsSessionSwitch but the target is already current', () => {
    renderHook(() => useScheduledDelivery());
    emit(MessageType.DELIVER_SCHEDULED_MESSAGE, {
      id: 'r3',
      sessionId: 'sess-a', // already current
      message: 'no switch needed',
      needsSessionSwitch: true,
    });
    expect(navigateToSessionMock).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith('no switch needed', 'ask_before_edit');
  });

  it('ignores a malformed payload (missing message)', () => {
    renderHook(() => useScheduledDelivery());
    emit(MessageType.DELIVER_SCHEDULED_MESSAGE, { id: 'r4', sessionId: 'sess-a' });
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
