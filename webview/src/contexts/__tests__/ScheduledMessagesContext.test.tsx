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

describe('reservation response ownership', () => {
  it('ignores a late GET response from the previous session', async () => {
    let finishA: (value: object) => void = () => {};
    sendMock.mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }));
    const { result, rerender } = renderHook(() => useScheduledMessages(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    ctx.currentSessionId = 'sess-b'; initialSchedules = [res('b', 'sess-b')];
    await act(async () => { rerender(); });
    expect(result.current.isLoading).toBe(false);
    await act(async () => { finishA({ schedules: [res('a')] }); });
    expect(result.current.reservations.map(r => r.id)).toEqual(['b']);
  });

  it('does not overwrite a cancellation broadcast with an older GET response', async () => {
    let finishGet: (value: object) => void = () => {};
    sendMock.mockImplementationOnce(() => new Promise(resolve => { finishGet = resolve; }));
    const { result } = renderHook(() => useScheduledMessages(), { wrapper });
    emit(MessageType.SCHEDULED_MESSAGE_UPDATED, { sessionId: 'sess-a', schedules: [] });
    await act(async () => { finishGet({ schedules: [res('canceled')] }); });
    expect(result.current.reservations).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('reservation query failure recovery', () => {
  it('ends loading after each failure and lets the user retry until success', async () => {
    sendMock.mockRejectedValueOnce(new Error('Request timed out'));
    const { result } = renderHook(() => useScheduledMessages(), { wrapper });
    await act(async () => {});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(true);
    sendMock.mockRejectedValueOnce(new Error('Still unavailable'));
    await act(async () => { result.current.refetch(); });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(true);
    initialSchedules = [res('restored')];
    await act(async () => { result.current.refetch(); });
    expect(result.current.hasError).toBe(false);
    expect(result.current.reservations.map(r => r.id)).toEqual(['restored']);
  });

  it('keeps a successful live update when an older query rejects', async () => {
    let fail: (error: Error) => void = () => {};
    sendMock.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const { result } = renderHook(() => useScheduledMessages(), { wrapper });
    emit(MessageType.SCHEDULED_MESSAGE_UPDATED, { sessionId: 'sess-a', schedules: [res('live')] });
    await act(async () => { fail(new Error('Old timeout')); });
    expect(result.current.hasError).toBe(false);
    expect(result.current.reservations.map(r => r.id)).toEqual(['live']);
  });
});
