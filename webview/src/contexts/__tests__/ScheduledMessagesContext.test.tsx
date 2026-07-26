import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MessageType, ScheduledMessageKind, type ScheduledMessage } from '@/shared';

// ── Mutable context read by the mocked hooks ─────────────────────────────────
const ctx = { currentSessionId: 'sess-a' as string | null };

type Handler = (message: { type: string; payload: Record<string, unknown>; timestamp: number }) => void;
const handlers = new Map<string, Handler>();
const unsubscribe = vi.fn();
const subscribeMock = vi.fn((type: string, handler: Handler) => {
  handlers.set(type, handler);
  return unsubscribe;
});
const sendMock = vi.fn((type: string, _payload?: Record<string, unknown>) => {
  if (type === MessageType.GET_SCHEDULED_MESSAGES) {
    return Promise.resolve({ schedules: initialSchedules });
  }
  return Promise.resolve({});
});
let initialSchedules: ScheduledMessage[] = [];

function emit(type: string, payload: Record<string, unknown>) {
  const h = handlers.get(type);
  if (!h) throw new Error(`no handler for ${type}`);
  act(() => h({ type, payload, timestamp: 0 }));
}

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send: sendMock, subscribe: subscribeMock, isConnected: true }),
}));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ currentSessionId: ctx.currentSessionId }),
}));

import {
  ScheduledMessagesProvider,
  useScheduledMessages,
} from '../ScheduledMessagesContext';

function wrapper({ children }: { children: ReactNode }) {
  return <ScheduledMessagesProvider>{children}</ScheduledMessagesProvider>;
}

function res(id: string, sessionId = 'sess-a'): ScheduledMessage {
  return {
    id,
    sessionId,
    sendAt: '2031-01-01T00:00:00.000Z',
    message: `msg ${id}`,
    kind: ScheduledMessageKind.USER_SCHEDULED,
    createdAt: '2030-12-31T00:00:00.000Z',
  };
}

beforeEach(() => {
  handlers.clear();
  sendMock.mockClear();
  subscribeMock.mockClear();
  ctx.currentSessionId = 'sess-a';
  initialSchedules = [];
});

describe('ScheduledMessagesContext', () => {
  it('requests GET_SCHEDULED_MESSAGES for the current session on mount', () => {
    renderHook(() => useScheduledMessages(), { wrapper });
    expect(sendMock).toHaveBeenCalledWith(MessageType.GET_SCHEDULED_MESSAGES, { sessionId: 'sess-a' });
  });

  it('seeds reservations from the GET response', async () => {
    initialSchedules = [res('r1'), res('r2')];
    const { result } = renderHook(() => useScheduledMessages(), { wrapper });
    // The GET promise resolves on a microtask; flush it.
    await act(async () => { await Promise.resolve(); });
    expect(result.current.reservations.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('updates reservations from a SCHEDULED_MESSAGE_UPDATED for this session', () => {
    const { result } = renderHook(() => useScheduledMessages(), { wrapper });
    emit(MessageType.SCHEDULED_MESSAGE_UPDATED, { sessionId: 'sess-a', schedules: [res('r9')] });
    expect(result.current.reservations.map((r) => r.id)).toEqual(['r9']);
  });

  it('ignores a SCHEDULED_MESSAGE_UPDATED for a different session', () => {
    const { result } = renderHook(() => useScheduledMessages(), { wrapper });
    emit(MessageType.SCHEDULED_MESSAGE_UPDATED, { sessionId: 'sess-OTHER', schedules: [res('x')] });
    expect(result.current.reservations).toEqual([]);
  });

  it('cancel(id) sends CANCEL_SCHEDULED_MESSAGE for the session', () => {
    const { result } = renderHook(() => useScheduledMessages(), { wrapper });
    act(() => result.current.cancel('r1'));
    expect(sendMock).toHaveBeenCalledWith(MessageType.CANCEL_SCHEDULED_MESSAGE, {
      sessionId: 'sess-a',
      id: 'r1',
    });
  });

  it('open/close panel and start/stop edit toggle their state', () => {
    const { result } = renderHook(() => useScheduledMessages(), { wrapper });
    expect(result.current.panelOpen).toBe(false);
    act(() => result.current.openPanel());
    expect(result.current.panelOpen).toBe(true);
    act(() => result.current.closePanel());
    expect(result.current.panelOpen).toBe(false);

    const r = res('r1');
    act(() => result.current.startEdit(r));
    expect(result.current.editing?.id).toBe('r1');
    act(() => result.current.stopEdit());
    expect(result.current.editing).toBeNull();
  });
});
