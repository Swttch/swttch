import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MessageType } from '@/shared';

/**
 * #433 — what decides that a session URL is bad.
 *
 * The redirect used to ask the session list whether the session existed. The
 * list holds ONE page, so every session ranked past that page was reported as
 * missing and the user was thrown out of a session that opens perfectly well.
 * The question now goes to the backend, which looked for the file.
 */

type SessionLoadedHandler = (message: { payload: Record<string, unknown> }) => void;

const handlers = new Map<string, SessionLoadedHandler>();
const mockSubscribe = vi.fn((type: string, handler: SessionLoadedHandler) => {
  handlers.set(type, handler);
  return () => handlers.delete(type);
});

const mockNavigateToNewSession = vi.fn();
const mockLoadSessions = vi.fn();
const mockSetSessionState = vi.fn();
const mockSyncEffectiveMode = vi.fn();
const mockIsNewlyCreatedSession = vi.fn(() => false);

let mockCurrentSessionId: string | null = 'sess-past-the-page';

vi.mock('../BridgeContext', () => ({
  BridgeProvider: ({ children }: { children: React.ReactNode }) => children,
  useBridgeContext: () => ({ subscribe: mockSubscribe, send: vi.fn(), isConnected: true }),
}));

const mockSessionsLoad = vi.fn();
vi.mock('../ApiContext', () => ({
  ApiProvider: ({ children }: { children: React.ReactNode }) => children,
  useApi: () => ({ sessions: { load: mockSessionsLoad } }),
  useApiContext: () => ({ isConnected: true }),
}));

/**
 * A full first page of OTHER sessions — the state that produced the bug.
 *
 * An empty list would not reproduce anything: the old check bailed out on
 * `sessions.length === 0` and let the session through. The failure needed a page
 * that is full and does not contain the session being opened, which is exactly
 * what a project with more than SESSION_PAGE_SIZE sessions hands the webview.
 */
const firstPageOfOtherSessions = Array.from({ length: 30 }, (_, i) => ({
  id: `other-${i}`,
  title: `Other session ${i}`,
}));

vi.mock('../SessionContext', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSessionContext: () => ({
    loadSessions: mockLoadSessions,
    sessions: firstPageOfOtherSessions,
    currentSessionId: mockCurrentSessionId,
    navigateToNewSession: mockNavigateToNewSession,
    isNewlyCreatedSession: mockIsNewlyCreatedSession,
    setSessionState: mockSetSessionState,
    syncEffectiveMode: mockSyncEffectiveMode,
  }),
}));

const mockLoadMessages = vi.fn();
vi.mock('../ChatStreamContext', () => ({
  ChatStreamProvider: ({ children }: { children: React.ReactNode }) => children,
  useChatStreamContext: () => ({
    loadMessages: mockLoadMessages,
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
    handler({ payload });
  });
}

describe('SessionLoader — redirecting a session URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    mockCurrentSessionId = 'sess-past-the-page';
    mockIsNewlyCreatedSession.mockReturnValue(false);
    render(<SessionLoader><div /></SessionLoader>);
  });

  it('keeps a session that the held page of the list does not contain', () => {
    emitSessionLoaded({
      sessionId: 'sess-past-the-page',
      messages: [{ type: 'user', uuid: 'u1' }],
      hasMore: false,
      sessionMissing: false,
    });

    expect(mockNavigateToNewSession).not.toHaveBeenCalled();
    expect(mockLoadMessages).toHaveBeenCalledWith([{ type: 'user', uuid: 'u1' }]);
  });

  it('leaves a session the backend reports as not on disk', () => {
    emitSessionLoaded({
      sessionId: 'sess-past-the-page',
      messages: [],
      hasMore: false,
      sessionMissing: true,
    });

    expect(mockNavigateToNewSession).toHaveBeenCalledOnce();
    expect(mockLoadMessages).not.toHaveBeenCalled();
  });

  it('keeps a session whose transcript merely holds nothing', () => {
    emitSessionLoaded({
      sessionId: 'sess-past-the-page',
      messages: [],
      hasMore: false,
      sessionMissing: false,
    });

    expect(mockNavigateToNewSession).not.toHaveBeenCalled();
  });

  it('ignores a missing report for a session that is no longer open', () => {
    emitSessionLoaded({
      sessionId: 'some-other-session',
      messages: [],
      hasMore: false,
      sessionMissing: true,
    });

    expect(mockNavigateToNewSession).not.toHaveBeenCalled();
  });

  it('keeps a newly created session that has no transcript yet', () => {
    mockIsNewlyCreatedSession.mockReturnValue(true);

    emitSessionLoaded({
      sessionId: 'sess-past-the-page',
      messages: [],
      hasMore: false,
      sessionMissing: true,
    });

    expect(mockNavigateToNewSession).not.toHaveBeenCalled();
  });

  // A backend older than this change sends no such field. Reading `undefined` as
  // "missing" would redirect every session it serves.
  it('keeps a session when the backend sends no verdict at all', () => {
    emitSessionLoaded({
      sessionId: 'sess-past-the-page',
      messages: [{ type: 'user', uuid: 'u1' }],
      hasMore: false,
    });

    expect(mockNavigateToNewSession).not.toHaveBeenCalled();
  });
});
