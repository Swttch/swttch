import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  AccountPoolStrategy,
  MessageType,
  ScheduledMessageKind,
  AutoResumeStatusPhase,
} from '@/shared';

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
  message?: { role: string; model?: string; content: unknown };
  // CLI markers that identify a synthetic usage-limit notice (429 / rate_limit).
  isApiErrorMessage?: boolean;
  apiErrorStatus?: number;
  error?: string;
}
interface Reservation {
  id: string;
  sessionId: string;
  sendAt: string;
  message: string;
  kind: string;
  createdAt: string;
}
interface Ctx {
  sessionId: string | null;
  inputMode: string;
  messages: Msg[];
  autoResumeOnLimit: boolean;
  /** Reservations served by the mocked ScheduledMessagesContext. */
  reservations: Reservation[];
  reservationsLoading?: boolean;
  accounts: {
    id: string;
    emailAddress: string;
    displayName: string | null;
    organizationName: string | null;
    subscriptionType: string | null;
    authMethod: string | null;
    createdAt: number;
    updatedAt: number;
    usageCached: null;
    usageCachedAt: number;
    active: boolean;
  }[];
  accountsLoading?: boolean;
  accountPools: {
    id: string;
    name: string;
    provider: 'claude';
    enabled: boolean;
    strategy: AccountPoolStrategy;
    accountIds: string[];
    createdAt: number;
    updatedAt: number;
  }[];
}
const ctx: Ctx = {
  sessionId: 'sess-a',
  inputMode: 'ask_before_edit',
  messages: [],
  autoResumeOnLimit: false,
  reservations: [],
  accounts: [],
  accountPools: [],
};

type Handler = (message: { type: string; payload: Record<string, unknown>; timestamp: number }) => void;
const handlers = new Map<string, Handler>();
const unsubscribe = vi.fn();
const subscribeMock = vi.fn((type: string, handler: Handler) => {
  handlers.set(type, handler);
  return unsubscribe;
});
const sendMock = vi.fn((_type: string, _payload?: Record<string, unknown>) =>
  Promise.resolve({}),
);
const sendMessageMock = vi.fn();
const switchToMock = vi.fn(() => Promise.resolve());
const { notifyMock, ensureSponsorMock } = vi.hoisted(() => ({ notifyMock: vi.fn(), ensureSponsorMock: vi.fn() }));

function emit(type: string, payload: Record<string, unknown>) {
  const h = handlers.get(type);
  if (!h) throw new Error(`no handler for ${type}`);
  act(() => h({ type, payload, timestamp: Date.now() }));
}

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ isConnected: true, send: sendMock, subscribe: subscribeMock, lastError: null }),
}));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    currentSessionId: ctx.sessionId,
    inputMode: ctx.inputMode,
    workingDirectory: '/work',
  }),
}));
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ sendMessage: sendMessageMock, messages: ctx.messages }),
}));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { autoResumeOnLimit: ctx.autoResumeOnLimit }, updateSetting: vi.fn() }),
}));
vi.mock('@/notifications', () => ({ notify: notifyMock }));
vi.mock('@/contexts/AutoResumeOverrideContext', () => ({
  useAutoResumeOverride: () => ({ getOverride: () => undefined, setOverride: vi.fn() }),
}));
// The hook now reads reservations from ScheduledMessagesContext (the SAME list
// the "예약된 메시지" panel renders) instead of keeping a private copy, so tests
// drive that context. `emitSchedules` stands in for the backend's
// SCHEDULED_MESSAGE_UPDATED broadcast reaching the provider.
vi.mock('@/contexts/ScheduledMessagesContext', () => ({
  useScheduledMessages: () => ({
    reservations: ctx.reservations,
    isLoading: ctx.reservationsLoading,
    cancel: vi.fn(),
    panelOpen: false,
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    editing: null,
    startEdit: vi.fn(),
    stopEdit: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/useAccounts', () => ({
  useAccounts: () => ({
    accounts: ctx.accounts,
    isLoading: ctx.accountsLoading,
    accountPools: ctx.accountPools,
    activeEmail: ctx.accounts.find((account) => account.active)?.emailAddress ?? null,
    error: null,
    refetch: vi.fn(),
    save: vi.fn(),
    switchTo: switchToMock,
    remove: vi.fn(),
    savePools: vi.fn(),
  }),
}));
vi.mock('@/utils/ensureSponsor', () => ({ ensureSponsor: ensureSponsorMock }));

// Imported AFTER the mocks.
import { useAutoResume } from '../useAutoResume';

const FUTURE = new Date(Date.now() + 5 * 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

/**
 * A CLI usage-limit notice, shaped like the real synthetic entry: the markers
 * (`<synthetic>` + isApiErrorMessage + 429/rate_limit) identify it as a notice,
 * and the text carries the reset time that parseResetsAtFromText reads.
 */
function limitMsg(uuid: string, resetsIso: string): Msg {
  return {
    type: 'assistant',
    uuid,
    isStreaming: false,
    message: {
      role: 'assistant',
      model: '<synthetic>',
      content: [{ type: 'text', text: `You've hit your session limit · resets ${resetsIso}` }],
    },
    isApiErrorMessage: true,
    apiErrorStatus: 429,
    error: 'rate_limit',
  };
}
function userMsg(uuid: string): Msg {
  return { type: 'user', uuid, message: { role: 'user', content: 'hi' } };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMock.mockImplementation((type: string) => Promise.resolve(
    type === MessageType.PREPARE_ACCOUNT_POOL_RECOVERY
      ? { recovery: null, continueInSession: false }
      : {},
  ));
  handlers.clear();
  ctx.sessionId = 'sess-a';
  ctx.inputMode = 'ask_before_edit';
  ctx.messages = [];
  ctx.autoResumeOnLimit = false;
  ctx.reservations = []; ctx.reservationsLoading = false;
  ctx.accounts = []; ctx.accountsLoading = false;
  ctx.accountPools = [];
  ensureSponsorMock.mockResolvedValue(true);
  switchToMock.mockResolvedValue(undefined);
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
    ctx.reservations = [makeReservation(new Date(Date.parse(FUTURE) + 30_000).toISOString())];
    const { result } = renderHook(() => useAutoResume());
    expect(result.current.action).toBe('cancel');
    act(() => result.current.cancel());
    const call = sendMock.mock.calls.find((c) => c[0] === MessageType.CANCEL_SCHEDULED_MESSAGE);
    expect(call![1]).toEqual({ sessionId: 'sess-a', id: 'r1' });
  });

  it('offers "resumeNow" for an already-passed reset and resumeNow() sends "continue" via chat', async () => {
    ctx.messages = [limitMsg('lim1', PAST)];
    const { result } = renderHook(() => useAutoResume());
    expect(result.current.action).toBe('resumeNow');
    await act(async () => {
      await result.current.resumeNow();
    });
    expect(ensureSponsorMock).toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith('continue', 'ask_before_edit');
  });

  it('non-sponsors still see the button; schedule() delegates gating to the backend (always sends)', () => {
    // Pattern A: schedule() unconditionally sends SCHEDULE_MESSAGE; the backend
    // rejects non-sponsors with SPONSOR_REQUIRED and the global IPC interceptor
    // surfaces the invite toast — so the frontend does not pre-check here.
    ctx.messages = [limitMsg('lim1', FUTURE)];
    const { result } = renderHook(() => useAutoResume());
    expect(result.current.action).toBe('schedule'); // button is visible for everyone
    act(() => result.current.schedule());
    expect(sendMock.mock.calls.some((c) => c[0] === MessageType.SCHEDULE_MESSAGE)).toBe(true);
  });

  it('non-sponsors: resumeNow() pre-checks sponsorship and aborts (no chat message) on failure', async () => {
    // Pattern B: resumeNow's side-effect is a plain chat message (frontend-side),
    // so it queries ensureSponsor first and bails when the user is not a sponsor.
    ensureSponsorMock.mockResolvedValue(false);
    ctx.messages = [limitMsg('lim1', PAST)];
    const { result } = renderHook(() => useAutoResume());
    expect(result.current.action).toBe('resumeNow');
    await act(async () => {
      await result.current.resumeNow();
    });
    expect(ensureSponsorMock).toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('maps AUTO_RESUME_STATUS RETRYING and a network failure to their status keys', () => {
    ctx.messages = [limitMsg('lim1', FUTURE)];
    const { result } = renderHook(() => useAutoResume());
    emit(MessageType.AUTO_RESUME_STATUS, { sessionId: 'sess-a', phase: AutoResumeStatusPhase.RETRYING, attempt: 1 });
    expect(result.current.statusKey).toBe('autoResume.status.retrying');
    emit(MessageType.AUTO_RESUME_STATUS, { sessionId: 'sess-a', phase: AutoResumeStatusPhase.FAILED, attempt: 2, error: 'Network error reaching Anthropic API', errorKind: 'network' });
    expect(result.current.statusKey).toBe('autoResume.error.network');
  });

  it('keeps a restored reservation while the transcript is still loading', () => {
    ctx.autoResumeOnLimit = true;
    ctx.reservations = [makeReservation(new Date(Date.parse(FUTURE) + 30000).toISOString())];
    const { result, rerender } = renderHook(() => useAutoResume());
    expect(sendMock).not.toHaveBeenCalled();
    ctx.messages = [limitMsg('lim1', FUTURE)];
    act(() => rerender());
    expect(result.current.action).toBe('cancel');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('auto-cancels: a new user message after the limit clears it and cancels any reservation', () => {
    ctx.messages = [limitMsg('lim1', FUTURE)];
    ctx.reservations = [makeReservation(new Date(Date.parse(FUTURE) + 30_000).toISOString())];
    const { result, rerender } = renderHook(() => useAutoResume());
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

  function enablePool() {
    ctx.messages = [limitMsg('lim1', FUTURE)];
    ctx.accounts = [account('acc-1', 'a@example.com', true), account('acc-2', 'b@example.com', false)];
    ctx.accountPools = [accountPool('pool-1', ['acc-1', 'acc-2'])];
  }

  it('keeps auto-resume available and explains a failed candidate usage lookup', async () => {
    enablePool(); ctx.autoResumeOnLimit = true;
    sendMock.mockResolvedValueOnce({ recovery: { sourceMessageUuid: 'lim1', accountId: 'acc-1',
      resetsAt: null, awaitingLimit: false, usageLookupFailed: true }, continueInSession: false });
    const { result } = renderHook(() => useAutoResume());
    await act(async () => {});
    expect(result.current.accountPoolError).toBeTruthy();
    expect(result.current.action).toBe('schedule');
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(sendMock.mock.calls.filter(c => c[0] === MessageType.SCHEDULE_MESSAGE)).toHaveLength(1);
  });

  it('prepares recovery before sending one foreground continuation, without sponsor gating', async () => {
    enablePool();
    sendMock.mockResolvedValue({ recovery: { sourceMessageUuid: 'lim1', accountId: 'acc-2',
      resetsAt: FUTURE, awaitingLimit: true }, continueInSession: true });
    const { result, rerender } = renderHook(() => useAutoResume());
    expect(result.current.action).toBeNull();
    await act(async () => {});
    expect(sendMock).toHaveBeenCalledWith(MessageType.PREPARE_ACCOUNT_POOL_RECOVERY, {
      sessionId: 'sess-a', sourceMessageUuid: 'lim1', model: undefined,
    }, { timeout: 30_000 });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith(expect.stringMatching(/^<system-reminder>/), 'ask_before_edit', undefined, undefined, 'acc-2');
    expect(switchToMock).not.toHaveBeenCalled();
    expect(ensureSponsorMock).not.toHaveBeenCalled();
    act(() => rerender());
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('uses the next real CLI limit for scheduling (automatic: %s)', async enabled => {
    enablePool(); ctx.autoResumeOnLimit = enabled;
    sendMock.mockResolvedValueOnce({ recovery: { sourceMessageUuid: 'lim1', accountId: 'acc-2',
      resetsAt: FUTURE, awaitingLimit: true }, continueInSession: true });
    const { result, rerender } = renderHook(() => useAutoResume());
    await act(async () => {});
    expect(sendMock.mock.calls.filter(c => c[0] === MessageType.SCHEDULE_MESSAGE)).toHaveLength(0);
    sendMock.mockResolvedValue({ recovery: { sourceMessageUuid: 'lim1', accountId: 'acc-2',
      resetsAt: FUTURE, awaitingLimit: false }, continueInSession: false });
    ctx.messages = [...ctx.messages, userMsg('hidden-reminder'), limitMsg('company-limit', FUTURE)];
    await act(async () => rerender());
    expect(result.current.limit?.messageUuid).toBe('company-limit');
    expect(result.current.action).toBe('schedule');
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls.filter(c => c[0] === MessageType.SCHEDULE_MESSAGE)).toHaveLength(enabled ? 1 : 0);
    if (!enabled) await act(async () => result.current.schedule());
    expect(result.current.action).toBe('schedule'); // no optimistic "scheduled" label
    ctx.reservations = [makeReservation(new Date(Date.parse(FUTURE) + 30_000).toISOString())];
    act(() => rerender());
    expect(result.current.action).toBe('cancel');
  });

  it('restores scheduling on reload without sending another reminder', async () => {
    enablePool();
    sendMock.mockResolvedValue({ recovery: { sourceMessageUuid: 'older-limit', accountId: 'acc-2',
      resetsAt: FUTURE, awaitingLimit: false }, continueInSession: false });
    const { result } = renderHook(() => useAutoResume());
    await act(async () => {});
    expect(result.current.action).toBe('schedule');
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it.each([false, true])('falls back to the existing account when no candidate is verified (automatic: %s)', async enabled => {
    enablePool(); ctx.autoResumeOnLimit = enabled;
    sendMock.mockResolvedValue({ recovery: null, continueInSession: false });
    const { result } = renderHook(() => useAutoResume());
    await act(async () => {});
    expect(result.current.action).toBe('schedule');
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(sendMock.mock.calls.filter(c => c[0] === MessageType.SCHEDULE_MESSAGE)).toHaveLength(enabled ? 1 : 0);
  });

  it('waits for the account registry after reload before attempting a reservation', async () => {
    ctx.accountsLoading = true; ctx.autoResumeOnLimit = true;
    ctx.messages = [limitMsg('lim1', FUTURE)];
    sendMock.mockResolvedValue({ recovery: null, continueInSession: false });
    const { result, rerender } = renderHook(() => useAutoResume());
    await act(async () => {});
    expect(result.current.action).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
    enablePool(); ctx.accountsLoading = false;
    await act(async () => rerender());
    expect(sendMock.mock.calls.filter(call => call[0] === MessageType.PREPARE_ACCOUNT_POOL_RECOVERY)).toHaveLength(1);
    expect(sendMock.mock.calls.filter(call => call[0] === MessageType.SCHEDULE_MESSAGE)).toHaveLength(1);
  });

  it('does not reserve or continue after preparation was canceled by user action', async () => {
    enablePool(); ctx.autoResumeOnLimit = true;
    sendMock.mockResolvedValue({ recovery: null, continueInSession: false, canceled: true });
    const { result } = renderHook(() => useAutoResume());
    await act(async () => {});
    expect(result.current.action).toBeNull();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(sendMock.mock.calls.filter(c => c[0] === MessageType.SCHEDULE_MESSAGE)).toHaveLength(0);
  });

  it('stops after a credential preparation error', async () => {
    enablePool(); ctx.autoResumeOnLimit = true;
    sendMock.mockRejectedValue(new Error('keychain locked'));
    const { result } = renderHook(() => useAutoResume());
    await act(async () => {});
    expect(result.current.accountPoolError).toBe('keychain locked');
    expect(result.current.action).toBeNull();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('does not send into a different session after navigation during preparation', async () => {
    enablePool();
    let finish = (_: object) => {};
    sendMock.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = renderHook(() => useAutoResume());
    ctx.sessionId = 'sess-b'; ctx.messages = [];
    act(() => rerender());
    await act(async () => finish({ recovery: { sourceMessageUuid: 'lim1', accountId: 'acc-2',
      resetsAt: FUTURE, awaitingLimit: true }, continueInSession: true }));
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it.each([FUTURE, '2020-01-01T00:00:00Z'])('does not rebook or resume after canceling a reservation restored on reload (%s)', resetsAt => {
    ctx.messages = [limitMsg('lim1', resetsAt)]; ctx.autoResumeOnLimit = true;
    ctx.reservations = [makeReservation(new Date(Date.parse(resetsAt) + 30000).toISOString())];
    const { result, rerender } = renderHook(() => useAutoResume());
    act(() => result.current.cancel());
    ctx.reservations = [];
    act(() => rerender());
    expect(sendMock.mock.calls.filter(call => call[0] === MessageType.SCHEDULE_MESSAGE)).toHaveLength(0);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('offers cancellation for an existing reservation even with a pool candidate', () => {
    enablePool();
    ctx.reservations = [makeReservation(new Date(Date.parse(FUTURE) + 30_000).toISOString())];
    const { result } = renderHook(() => useAutoResume());
    expect(result.current.action).toBe('cancel');
    act(() => result.current.cancel());
    expect(sendMock).toHaveBeenCalledWith(MessageType.CANCEL_SCHEDULED_MESSAGE, { sessionId: 'sess-a', id: 'r1' });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('fires the countdown notification once when the reset is reached', () => {
    vi.useFakeTimers();
    const now = Date.now();
    ctx.messages = [limitMsg('lim1', FUTURE)];
    // scheduled sendAt = now+30s → resetsAt = now → countdown ~30
    ctx.reservations = [makeReservation(new Date(now + 30_000).toISOString())];
    const { result } = renderHook(() => useAutoResume());
    expect(result.current.countdownSeconds).not.toBeNull();
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  // ── Auto-resume is "the click", not a second feature ───────────────────────
  // These pin the property the whole change exists for: with the preference on,
  // the hook must press exactly the button the manual UI is currently offering.
  describe('auto-resume presses whatever action the manual UI offers', () => {
    it('resumes immediately when the reset has ALREADY passed (regression: used to do nothing)', async () => {
      // The real-world case: the limit hit at 03:26, reset at 04:10, and the user
      // reopened the session at 04:12. The manual UI offers "resume now" here, so
      // auto-resume must resume — the old guard bailed out on a past reset and
      // left the session dead with no reservation and no message.
      ctx.autoResumeOnLimit = true;
      ctx.messages = [limitMsg('lim1', PAST)];
      const { result } = renderHook(() => useAutoResume());
      expect(result.current.action).toBe('resumeNow');
      await act(async () => {
        await Promise.resolve();
      });
      expect(sendMessageMock).toHaveBeenCalledWith('continue', 'ask_before_edit');
      expect(sendMock.mock.calls.some((c) => c[0] === MessageType.SCHEDULE_MESSAGE)).toBe(false);
    });

    it('schedules (not resumes) while the reset is still ahead', () => {
      ctx.autoResumeOnLimit = true;
      ctx.messages = [limitMsg('lim1', FUTURE)];
      const { result } = renderHook(() => useAutoResume());
      expect(result.current.action).toBe('schedule');
      expect(sendMock.mock.calls.some((c) => c[0] === MessageType.SCHEDULE_MESSAGE)).toBe(true);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it('does nothing while a reservation is pending (the offered action is "cancel")', () => {
      ctx.autoResumeOnLimit = true;
      ctx.messages = [limitMsg('lim1', FUTURE)];
      ctx.reservations = [makeReservation(new Date(Date.parse(FUTURE) + 30_000).toISOString())];
      const { result } = renderHook(() => useAutoResume());
      expect(result.current.action).toBe('cancel');
      expect(sendMock.mock.calls.some((c) => c[0] === MessageType.SCHEDULE_MESSAGE)).toBe(false);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it('presses only once per offered action (no repeat sends on re-render)', async () => {
      ctx.autoResumeOnLimit = true;
      ctx.messages = [limitMsg('lim1', PAST)];
      const { rerender } = renderHook(() => useAutoResume());
      await act(async () => {
        await Promise.resolve();
      });
      act(() => rerender());
      act(() => rerender());
      await act(async () => {
        await Promise.resolve();
      });
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
    });

    it('stays put when the preference is off (manual UI still offers the button)', async () => {
      ctx.autoResumeOnLimit = false;
      ctx.messages = [limitMsg('lim1', PAST)];
      const { result } = renderHook(() => useAutoResume());
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.action).toBe('resumeNow'); // the button is there…
      expect(sendMessageMock).not.toHaveBeenCalled(); // …but nobody pressed it
    });
  });
});

function account(id: string, emailAddress: string, active: boolean): Ctx['accounts'][number] {
  return {
    id,
    emailAddress,
    displayName: null,
    organizationName: null,
    subscriptionType: 'max',
    authMethod: 'claudeai',
    createdAt: 1,
    updatedAt: 1,
    usageCached: null,
    usageCachedAt: 0,
    active,
  };
}

function accountPool(id: string, accountIds: string[]): Ctx['accountPools'][number] {
  return {
    id,
    name: 'Pool',
    provider: 'claude',
    enabled: true,
    strategy: AccountPoolStrategy.ORDERED,
    accountIds,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('PR 422 independent review reproduction', () => {
  it('starts automatic scheduling in B after leaving a reserved session A', async () => {
    ctx.autoResumeOnLimit = true;
    ctx.messages = [limitMsg('limit-a', FUTURE)];
    ctx.reservations = [makeReservation(FUTURE)];
    const { result, rerender } = renderHook(() => useAutoResume());
    ctx.sessionId = 'sess-b';
    ctx.messages = [limitMsg('limit-b', FUTURE)];
    ctx.reservations = [];
    await act(async () => { rerender(); });
    expect(result.current.action).toBe('schedule');
    expect(sendMock).toHaveBeenCalledWith(MessageType.SCHEDULE_MESSAGE,
      expect.objectContaining({ sessionId: 'sess-b' }));
  });

  it('keeps an existing reservation actionable after returning to A', async () => {
    ctx.autoResumeOnLimit = true;
    ctx.messages = [limitMsg('limit-a', FUTURE)];
    ctx.reservations = [makeReservation(FUTURE)];
    const { result, rerender } = renderHook(() => useAutoResume());
    ctx.sessionId = 'sess-b';
    ctx.reservations = [];
    await act(async () => { rerender(); });
    ctx.messages = [];
    await act(async () => { rerender(); });
    ctx.sessionId = 'sess-a';
    ctx.messages = [limitMsg('limit-a', FUTURE)];
    ctx.reservations = [makeReservation(FUTURE)];
    await act(async () => { rerender(); });
    expect(result.current.action).toBe('cancel');
    expect(result.current.scheduled?.id).toBe('r1');
    expect(sendMock.mock.calls.filter(call => call[0] === MessageType.CANCEL_SCHEDULED_MESSAGE)).toHaveLength(0);
  });

  it('restores the fallback action after leaving and returning to A', async () => {
    ctx.accounts = [account('acc-a', 'a@example.test', true), account('acc-b', 'b@example.test', false)];
    ctx.accountPools = [accountPool('pool', ['acc-a','acc-b'])];
    ctx.messages = [limitMsg('limit-a', FUTURE)];
    const { result, rerender } = renderHook(() => useAutoResume());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.action).toBe('schedule');
    ctx.sessionId = 'sess-b';
    ctx.messages = [];
    await act(async () => { rerender(); });
    ctx.sessionId = 'sess-a';
    ctx.messages = [limitMsg('limit-a', FUTURE)];
    await act(async () => { rerender(); });
    expect(result.current.action).toBe('schedule');
  });

});

describe('reservation loading and cancellation across navigation', () => {
  it('waits for the reservation list before starting recovery or scheduling', async () => {
    ctx.autoResumeOnLimit = true;
    ctx.messages = [limitMsg('lim-loading', FUTURE)];
    ctx.reservationsLoading = true;
    const { result, rerender } = renderHook(() => useAutoResume());
    expect(result.current.action).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
    ctx.reservations = [makeReservation(FUTURE)];
    ctx.reservationsLoading = false;
    await act(async () => { rerender(); });
    expect(result.current.action).toBe('cancel');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('does not lose a real cancellation when visiting another session', async () => {
    ctx.autoResumeOnLimit = true;
    ctx.messages = [limitMsg('cancel-a', FUTURE)];
    ctx.reservations = [makeReservation(FUTURE)];
    const { rerender } = renderHook(() => useAutoResume());
    ctx.reservations = [];
    await act(async () => { rerender(); });
    ctx.sessionId = 'sess-b'; ctx.messages = [];
    await act(async () => { rerender(); });
    ctx.sessionId = 'sess-a'; ctx.messages = [limitMsg('cancel-a', FUTURE)];
    await act(async () => { rerender(); });
    expect(sendMock.mock.calls.filter(call => call[0] === MessageType.SCHEDULE_MESSAGE)).toHaveLength(0);
  });

  it('does not apply an old recovery response after A to B to A navigation', async () => {
    ctx.accounts = [account('a', 'a@example.test', true), account('b', 'b@example.test', false)];
    ctx.accountPools = [accountPool('pool', ['a','b'])];
    ctx.messages = [limitMsg('limit-a', FUTURE)];
    let finishOld: (value: object) => void = () => {};
    sendMock.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const { result, rerender } = renderHook(() => useAutoResume());
    ctx.sessionId = 'sess-b'; ctx.messages = [];
    await act(async () => { rerender(); });
    ctx.sessionId = 'sess-a'; ctx.messages = [limitMsg('limit-a', FUTURE)];
    await act(async () => { rerender(); });
    await act(async () => { finishOld({ recovery: { accountId: 'b' }, continueInSession: true }); });
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(result.current.action).toBe('schedule');
  });
});

describe('reservation identity isolation', () => {
  it('does not mark temporary list loading as a cancellation', async () => {
    ctx.autoResumeOnLimit = true; ctx.messages = [limitMsg('loading-a', FUTURE)];
    ctx.reservations = [makeReservation(FUTURE)];
    const { result, rerender } = renderHook(() => useAutoResume());
    ctx.reservationsLoading = true; ctx.reservations = [];
    await act(async () => { rerender(); });
    expect(sendMock).not.toHaveBeenCalled();
    ctx.reservationsLoading = false; ctx.reservations = [makeReservation(FUTURE)];
    await act(async () => { rerender(); });
    expect(result.current.action).toBe('cancel');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('does not transfer cancellation to another session with the same notice UUID', async () => {
    ctx.autoResumeOnLimit = true; ctx.messages = [limitMsg('shared-uuid', FUTURE)];
    ctx.reservations = [makeReservation(FUTURE)];
    const { rerender } = renderHook(() => useAutoResume());
    ctx.reservations = [];
    await act(async () => { rerender(); });
    ctx.sessionId = 'sess-b';
    await act(async () => { rerender(); });
    expect(sendMock).toHaveBeenCalledWith(MessageType.SCHEDULE_MESSAGE,
      expect.objectContaining({ sessionId: 'sess-b' }));
  });
});
