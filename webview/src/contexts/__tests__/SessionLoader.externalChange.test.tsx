import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MessageType } from '@/shared';

/**
 * A program the backend does not run (a session woken by the session-management MCP, one running in the desktop
 * app) writes to the transcript of the session shown. The backend says so, and the screen reads the session again
 * with the read that opened it, so it follows the session while it works.
 */

type Handler = (message: { payload: Record<string, unknown> }) => void;

const handlers = new Map<string, Handler>();
const mockSubscribe = vi.fn((type: string, handler: Handler) => {
  handlers.set(type, handler);
  return () => handlers.delete(type);
});

let mockCurrentSessionId: string | null = 'child';

const mockSend = vi.fn().mockResolvedValue(undefined);
vi.mock('../BridgeContext', () => ({
  BridgeProvider: ({ children }: { children: React.ReactNode }) => children,
  useBridgeContext: () => ({ subscribe: mockSubscribe, send: mockSend, isConnected: true }),
}));

const mockSessionsLoad = vi.fn().mockResolvedValue(undefined);
vi.mock('../ApiContext', () => ({
  ApiProvider: ({ children }: { children: React.ReactNode }) => children,
  useApi: () => ({ sessions: { load: mockSessionsLoad } }),
  useApiContext: () => ({ isConnected: true }),
}));

vi.mock('../SessionContext', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSessionContext: () => ({
    loadSessions: vi.fn(),
    sessions: [],
    currentSessionId: mockCurrentSessionId,
    navigateToNewSession: vi.fn(),
    mergeSession: vi.fn(),
    isNewlyCreatedSession: () => false,
    setSessionState: vi.fn(),
    syncEffectiveMode: vi.fn(),
  }),
}));

const mockLoadMessages = vi.fn();
const mockRefreshMessages = vi.fn();
vi.mock('../ChatStreamContext', () => ({
  ChatStreamProvider: ({ children }: { children: React.ReactNode }) => children,
  useChatStreamContext: () => ({
    loadMessages: mockLoadMessages,
    refreshMessages: mockRefreshMessages,
    prependOlderMessages: vi.fn(),
    appendNewerMessages: vi.fn(),
    jumpToMessages: vi.fn(),
    resetForSessionSwitch: vi.fn(),
  }),
}));

vi.mock('../SettingsContext', () => ({
  SettingsProvider: ({ children }: { children: React.ReactNode }) => children,
  useSettings: () => ({ settings: {} }),
  useSettingsOrNull: () => ({ settings: {} }),
}));

vi.mock('../WorkingDirContext', () => ({
  WorkingDirProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkingDir: () => ({ workingDirectory: '/work' }),
  readWorkingDirFromUrl: () => '/work',
}));

import { SessionLoader } from '../AppProviders';

function told(sessionId: string): void {
  const handler = handlers.get(MessageType.SESSION_EXTERNALLY_CHANGED);
  if (!handler) throw new Error('SESSION_EXTERNALLY_CHANGED handler was never registered');
  act(() => handler({ payload: { sessionId } }));
}

function loaded(sessionId: string): void {
  const handler = handlers.get(MessageType.SESSION_LOADED);
  if (!handler) throw new Error('SESSION_LOADED handler was never registered');
  act(() => handler({ payload: { sessionId, messages: [{ type: 'user', uuid: 'u1' }], hasMore: false } }));
}

describe('SessionLoader: a session another program works on', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    handlers.clear();
    mockCurrentSessionId = 'child';
    render(<SessionLoader><div /></SessionLoader>);
    // The read that opens the session.
    mockSessionsLoad.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the session again when the backend says its transcript grew', () => {
    told('child');
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSessionsLoad).toHaveBeenCalledTimes(1);
    expect(mockSessionsLoad).toHaveBeenCalledWith('child', '/work');
  });

  it('reads once for a burst of news', () => {
    told('child');
    told('child');
    told('child');
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSessionsLoad).toHaveBeenCalledTimes(1);
  });

  it('leaves alone the news of a session that is not the one shown', () => {
    told('some-other-session');
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSessionsLoad).not.toHaveBeenCalled();
  });

  it('joins the page it asked for to what is held, so that what did not change is not drawn again', () => {
    told('child');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    loaded('child');

    expect(mockRefreshMessages).toHaveBeenCalledWith([{ type: 'user', uuid: 'u1' }], false);
    expect(mockLoadMessages).not.toHaveBeenCalled();
  });

  it('replaces what is held, as always, for any other read of the session', () => {
    loaded('child');

    expect(mockLoadMessages).toHaveBeenCalledWith([{ type: 'user', uuid: 'u1' }], false);
    expect(mockRefreshMessages).not.toHaveBeenCalled();
  });

  it('says the session is read once the screen it is shown on has drawn what the other program wrote', () => {
    told('child');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    loaded('child');

    expect(mockSend).toHaveBeenCalledWith(MessageType.MARK_SESSION_READ, { sessionId: 'child' });
  });

  it('does not say it is read for a read the person did not look at (a hidden screen)', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try {
      told('child');
      act(() => {
        vi.advanceTimersByTime(300);
      });
      loaded('child');

      expect(mockSend).not.toHaveBeenCalledWith(MessageType.MARK_SESSION_READ, expect.anything());
    } finally {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    }
  });
});
