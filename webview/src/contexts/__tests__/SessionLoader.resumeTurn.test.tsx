import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MessageType } from '@/shared';

/**
 * #673 — a screen that attaches in the middle of a turn.
 *
 * A reloaded page did not see the turn start, so its composer said "idle" (no stop
 * button) over a CLI that was working, until the answer arrived. The backend says when
 * the turn began on SESSION_LOADED, and the loader takes it up.
 */

type SessionLoadedHandler = (message: { payload: Record<string, unknown> }) => void;

const handlers = new Map<string, SessionLoadedHandler>();
const mockSubscribe = vi.fn((type: string, handler: SessionLoadedHandler) => {
  handlers.set(type, handler);
  return () => handlers.delete(type);
});

vi.mock('../BridgeContext', () => ({
  BridgeProvider: ({ children }: { children: React.ReactNode }) => children,
  useBridgeContext: () => ({ subscribe: mockSubscribe, send: vi.fn(), isConnected: true }),
}));

vi.mock('../ApiContext', () => ({
  ApiProvider: ({ children }: { children: React.ReactNode }) => children,
  useApi: () => ({ sessions: { load: vi.fn() } }),
  useApiContext: () => ({ isConnected: true }),
}));

vi.mock('../SessionContext', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSessionContext: () => ({
    loadSessions: vi.fn(),
    sessions: [],
    currentSessionId: 'sess-1',
    navigateToNewSession: vi.fn(),
    mergeSession: vi.fn(),
    isNewlyCreatedSession: () => false,
    setSessionState: vi.fn(),
    syncEffectiveMode: vi.fn(),
  }),
}));

const mockLoadMessages = vi.fn();
const mockResumeTurn = vi.fn();
vi.mock('../ChatStreamContext', () => ({
  ChatStreamProvider: ({ children }: { children: React.ReactNode }) => children,
  useChatStreamContext: () => ({
    loadMessages: mockLoadMessages,
    resumeTurn: mockResumeTurn,
    prependOlderMessages: vi.fn(),
    setPaginationState: vi.fn(),
    resetForSessionSwitch: vi.fn(),
  }),
}));

vi.mock('../SettingsContext', () => ({
  SettingsProvider: ({ children }: { children: React.ReactNode }) => children,
  useSettings: () => ({ settings: {} }),
}));

vi.mock('../WorkingDirContext', () => ({
  WorkingDirProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkingDir: () => ({ workingDirectory: '/work' }),
  readWorkingDirFromUrl: () => '/work',
}));

import { SessionLoader } from '../AppProviders';

function emitSessionLoaded(payload: Record<string, unknown>): void {
  const handler = handlers.get(MessageType.SESSION_LOADED);
  if (!handler) throw new Error('SESSION_LOADED handler was never registered');
  act(() => {
    handler({ payload: { sessionId: 'sess-1', messages: [], hasMore: false, ...payload } });
  });
}

describe('SessionLoader — taking up a turn already running', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    render(<SessionLoader><div /></SessionLoader>);
  });

  it('resumes the turn from the time the backend says it began', () => {
    emitSessionLoaded({ turnStartedAt: 1_800_000_000_000 });

    expect(mockResumeTurn).toHaveBeenCalledTimes(1);
    expect(mockResumeTurn).toHaveBeenCalledWith(1_800_000_000_000);
  });

  it('does nothing when no turn is running (null) or the backend said nothing (an older one)', () => {
    emitSessionLoaded({ turnStartedAt: null });
    emitSessionLoaded({});

    expect(mockResumeTurn).not.toHaveBeenCalled();
    // The messages still load as they always did.
    expect(mockLoadMessages).toHaveBeenCalledTimes(2);
  });

  it('does not resume from an older page, which is more of the same transcript', () => {
    emitSessionLoaded({ turnStartedAt: 1_800_000_000_000, prepend: true });

    expect(mockResumeTurn).not.toHaveBeenCalled();
  });

  it('does not resume a turn for a session that is no longer the one on screen', () => {
    emitSessionLoaded({ sessionId: 'sess-other', turnStartedAt: 1_800_000_000_000 });

    expect(mockResumeTurn).not.toHaveBeenCalled();
  });
});
