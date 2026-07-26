import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType, ScheduledMessageKind, AutoResumeStatusPhase } from '@/shared';

// ---------------------------------------------------------------------------
// Mutable test context read by the mocked hooks/contexts. The limit notice is
// now derived from `messages` (not a LIMIT_REACHED event), so tests seed a limit
// by putting an assistant message whose text matches the limit pattern and
// carries an (ISO) reset time that parseResetsAtFromText can read.
// ---------------------------------------------------------------------------
interface Msg {
  type: string;
  uuid: string;
  isStreaming?: boolean;
  message?: { role: string; content: unknown };
}
interface Ctx {
  sessionId: string | null;
  inputMode: string;
  messages: Msg[];
  autoResumeOnLimit: boolean;
  isSponsor: boolean;
  initialSchedules: unknown[];
}
const ctx: Ctx = {
  sessionId: 'sess-a',
  inputMode: 'ask_before_edit',
  messages: [],
  autoResumeOnLimit: false,
  isSponsor: true,
  initialSchedules: [],
};

type Handler = (message: { type: string; payload: Record<string, unknown>; timestamp: number }) => void;
const handlers = new Map<string, Handler>();
const unsubscribe = vi.fn();
const subscribeMock = vi.fn((type: string, handler: Handler) => {
  handlers.set(type, handler);
  return unsubscribe;
});
const sendMock = vi.fn((type: string, _payload?: Record<string, unknown>) => {
  if (type === MessageType.GET_SCHEDULED_MESSAGES) {
    return Promise.resolve({ schedules: ctx.initialSchedules });
  }
  return Promise.resolve({});
});
const sendMessageMock = vi.fn();
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }));

function emit(type: string, payload: Record<string, unknown>) {
  const h = handlers.get(type);
  if (!h) throw new Error(`no handler for ${type}`);
  act(() => h({ type, payload, timestamp: Date.now() }));
}

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ isConnected: true, send: sendMock, subscribe: subscribeMock, lastError: null }),
}));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ currentSessionId: ctx.sessionId, inputMode: ctx.inputMode }),
}));
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ sendMessage: sendMessageMock, messages: ctx.messages }),
}));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { autoResumeOnLimit: ctx.autoResumeOnLimit }, updateSetting: vi.fn() }),
}));
vi.mock('@/hooks/queries/useSponsorStatus', () => ({
  useSponsorStatus: () => ({ isSponsor: ctx.isSponsor }),
}));
vi.mock('@/notifications', () => ({ notify: notifyMock }));
vi.mock('@/contexts/AutoResumeOverrideContext', () => ({
  useAutoResumeOverride: () => ({ getOverride: () => undefined, setOverride: vi.fn() }),
}));

// Imported AFTER the mocks.
import { useAutoResume } from '../useAutoResume';

const FUTURE = new Date(Date.now() + 5 * 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

/** An assistant limit notice whose text carries an ISO reset time. */
function limitMsg(uuid: string, resetsIso: string): Msg {
  return {
    type: 'assistant',
    uuid,
    isStreaming: false,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: `You've hit your session limit · resets ${resetsIso}` }],
    },
  };
}
function userMsg(uuid: string): Msg {
  return { type: 'user', uuid, message: { role: 'user', content: 'hi' } };
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  ctx.sessionId = 'sess-a';
  ctx.inputMode = 'ask_before_edit';
  ctx.messages = [];
  ctx.autoResumeOnLimit = false;
  ctx.isSponsor = true;
  ctx.initialSchedules = [];
});
afterEach(() => vi.useRealTimers());

function makeReservation(sendAt: string) {
  return {
    id: 'r1',
    sessionId: 'sess-a',
    sendAt,
    message: 'continue',
    kind: ScheduledMessageKind.AUTO_RESUME,
    createdAt: new Date().toISOString(),
  };
}

describe('useAutoResume', () => {
  it('derives a limit from a session message and offers "schedule" for a future reset', () => {
    ctx.messages = [limitMsg('lim1', FUTURE)];
    const { result } = renderHook(() => useAutoResume());
    expect(result.current.limit?.messageUuid).toBe('lim1');
    expect(result.current.limit?.resetsAt).toBe(FUTURE);
    expect(result.current.action).toBe('schedule');
  });

  it('shows no limit when the session has no limit message', () => {
    ctx.messages = [userMsg('u1')];
    const { result } = renderHook(() => useAutoResume());
    expect(result.current.limit).toBeNull();
    expect(result.current.action).toBeNull();
  });

  it('schedule() sends SCHEDULE_MESSAGE with sendAt = resetsAt + 30s, kind AUTO_RESUME, message "continue"', () => {
    ctx.messages = [limitMsg('lim1', FUTURE)];
    const { result } = renderHook(() => useAutoResume());
    act(() => result.current.schedule());
    const call = sendMock.mock.calls.find((c) => c[0] === MessageType.SCHEDULE_MESSAGE);
    expect(call).toBeTruthy();
    expect(call![1]).toEqual({
      sessionId: 'sess-a',
      sendAt: new Date(Date.parse(FUTURE) + 30_000).toISOString(),
      message: 'continue',
      kind: ScheduledMessageKind.AUTO_RESUME,
    });
  });

  it('offers "cancel" once a reservation exists and cancel() sends CANCEL_SCHEDULED_MESSAGE by id', () => {
    ctx.messages = [limitMsg('lim1', FUTURE)];
    const { result } = renderHook(() => useAutoResume());
    emit(MessageType.SCHEDULED_MESSAGE_UPDATED, {
      sessionId: 'sess-a',
      schedules: [makeReservation(new Date(Date.parse(FUTURE) + 30_000).toISOString())],
    });
    expect(result.current.action).toBe('cancel');
    act(() => result.current.cancel());
    const call = sendMock.mock.calls.find((c) => c[0] === MessageType.CANCEL_SCHEDULED_MESSAGE);
    expect(call![1]).toEqual({ sessionId: 'sess-a', id: 'r1' });
  });

  it('offers "resumeNow" for an already-passed reset and resumeNow() sends "continue" via chat', () => {
    ctx.messages = [limitMsg('lim1', PAST)];
    const { result } = renderHook(() => useAutoResume());
    expect(result.current.action).toBe('resumeNow');
    act(() => result.current.resumeNow());
    expect(sendMessageMock).toHaveBeenCalledWith('continue', 'ask_before_edit');
  });

  it('hides the action (null) for non-sponsors even with a limit', () => {
    ctx.isSponsor = false;
    ctx.messages = [limitMsg('lim1', FUTURE)];
    const { result } = renderHook(() => useAutoResume());
    expect(result.current.action).toBeNull();
  });

  it('maps AUTO_RESUME_STATUS RETRYING and a network failure to their status keys', () => {
    ctx.messages = [limitMsg('lim1', FUTURE)];
    const { result } = renderHook(() => useAutoResume());
    emit(MessageType.AUTO_RESUME_STATUS, { sessionId: 'sess-a', phase: AutoResumeStatusPhase.RETRYING, attempt: 1 });
    expect(result.current.statusKey).toBe('autoResume.status.retrying');
    emit(MessageType.AUTO_RESUME_STATUS, { sessionId: 'sess-a', phase: AutoResumeStatusPhase.FAILED, attempt: 2, error: 'Network error reaching Anthropic API', errorKind: 'network' });
    expect(result.current.statusKey).toBe('autoResume.error.network');
  });

  it('auto-cancels: a new user message after the limit clears it and cancels any reservation', () => {
    ctx.messages = [limitMsg('lim1', FUTURE)];
    const { result, rerender } = renderHook(() => useAutoResume());
    emit(MessageType.SCHEDULED_MESSAGE_UPDATED, {
      sessionId: 'sess-a',
      schedules: [makeReservation(new Date(Date.parse(FUTURE) + 30_000).toISOString())],
    });
    expect(result.current.action).toBe('cancel');

    // User types again → a user message now sits after the limit notice.
    ctx.messages = [limitMsg('lim1', FUTURE), userMsg('u2')];
    act(() => rerender());

    expect(result.current.limit).toBeNull();
    expect(result.current.action).toBeNull();
    expect(sendMock.mock.calls.some((c) => c[0] === MessageType.CANCEL_SCHEDULED_MESSAGE)).toBe(true);
  });

  it('auto-schedules when the preference is enabled and a future-reset limit is present', () => {
    ctx.autoResumeOnLimit = true;
    ctx.messages = [limitMsg('lim1', FUTURE)];
    renderHook(() => useAutoResume());
    expect(sendMock.mock.calls.some((c) => c[0] === MessageType.SCHEDULE_MESSAGE)).toBe(true);
  });

  it('fires the countdown notification once when the reset is reached', () => {
    vi.useFakeTimers();
    const now = Date.now();
    ctx.messages = [limitMsg('lim1', FUTURE)];
    const { result } = renderHook(() => useAutoResume());
    emit(MessageType.SCHEDULED_MESSAGE_UPDATED, {
      sessionId: 'sess-a',
      schedules: [makeReservation(new Date(now + 30_000).toISOString())],
    });
    // scheduled sendAt = now+30s → resetsAt = now → countdown ~30
    expect(result.current.countdownSeconds).not.toBeNull();
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });
});
