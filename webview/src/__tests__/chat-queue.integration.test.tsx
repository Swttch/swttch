/**
 * The "queue" composer follow-up-behavior path — feature B of the follow-up
 * message spec (feature A, "steer", is the plain stdin send `chat-
 * streaming.integration.test.tsx` already covers via handleSubmit → sendMessage).
 *
 * Mirrors that file's mocking style (mocked Bridge/Session/CliConfig/
 * ClaudeSettings contexts around a real ChatStreamProvider), with SettingsContext
 * additionally mocked here since this is the behavior that reads it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
import React from 'react';
import { ChatStreamProvider, useChatStreamContext } from '../contexts/ChatStreamContext';
import { ChatInputStateProvider, useChatInputState } from '../contexts/ChatInputStateContext';
import { FollowUpBehavior, MessageType } from '@/shared';

// Mock requestAnimationFrame/cancelAnimationFrame (RichInput-adjacent code paths
// used elsewhere in this provider tree expect these to exist under jsdom).
globalThis.requestAnimationFrame = vi.fn((cb) => {
  cb(0);
  return 0;
});
globalThis.cancelAnimationFrame = vi.fn();

const mockBridge = {
  isConnected: true,
  send: vi.fn().mockResolvedValue({ status: 'ok', queue: [] }),
  subscribe: vi.fn(),
  lastMessage: null,
  connectionStatus: 'connected' as const,
};

vi.mock('../contexts/BridgeContext', () => ({
  useBridgeContext: () => mockBridge,
  BridgeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockSession = {
  currentSessionId: 'queue-session',
  sessions: [],
  sessionState: 'idle' as const,
  isLoading: false,
  workingDirectory: '/test',
  inputMode: 'ask_before_edit' as const,
  requestedInputMode: 'ask_before_edit' as string | null,
  autoModeAvailable: false,
  autoFallbackNotice: false,
  loadSessions: vi.fn(),
  resetToNewSession: vi.fn(),
  openNewTab: vi.fn(),
  openSettings: vi.fn(),
  switchSession: vi.fn(),
  deleteSession: vi.fn(),
  renameSession: vi.fn(),
  setSessionState: vi.fn(),
  setWorkingDirectory: vi.fn(),
  navigateToSession: vi.fn(),
  navigateToNewSession: vi.fn(),
  addNewSession: vi.fn(),
  setInputMode: vi.fn(),
  cycleInputMode: vi.fn(),
  syncEffectiveMode: vi.fn(),
  setAutoModeAvailable: vi.fn(),
  notifyAutoFallback: vi.fn(),
  dismissAutoFallback: vi.fn(),
  isNewlyCreatedSession: vi.fn().mockReturnValue(false),
};

vi.mock('../contexts/SessionContext', () => ({
  useSessionContext: () => mockSession,
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null, isLoading: false, refresh: vi.fn() }),
  CliConfigProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ settings: { permissions: {} } }),
  ClaudeSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The setting under test: composerFollowUpBehavior, read by resolveFollowUpBehavior.
let composerFollowUpBehavior: FollowUpBehavior = FollowUpBehavior.Queue;
vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { get composerFollowUpBehavior() { return composerFollowUpBehavior; } } }),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const inputRef = React.useRef('');
  const setInputCallbackRef = React.useRef<(value: string) => void>(() => {});
  const setInput = React.useCallback((value: string) => {
    setInputCallbackRef.current(value);
  }, []);
  return (
    <MemoryRouter>
      <ChatStreamProvider setInput={setInput} inputRef={inputRef}>
        <ChatInputStateProvider inputRef={inputRef} setInputCallbackRef={setInputCallbackRef}>
          {children}
        </ChatInputStateProvider>
      </ChatStreamProvider>
    </MemoryRouter>
  );
}

function TestChatComponent() {
  const ctx = useChatStreamContext();
  const { input, setInput } = useChatInputState();
  return (
    <div>
      <div data-testid="is-streaming">{String(ctx.isStreaming)}</div>
      <div data-testid="queue-count">{ctx.queuedMessages.length}</div>
      <div data-testid="queue-contents">{ctx.queuedMessages.map(m => m.content).join('|')}</div>
      <input data-testid="input" value={input} onChange={(e) => setInput(e.target.value)} />
      <button data-testid="submit" onClick={() => ctx.handleSubmit(undefined, 'ask_before_edit')}>
        Send
      </button>
      {/* What the key derived from the send shortcut does: same send, with the
          follow-up behavior flipped for this one message. */}
      <button
        data-testid="submit-inverted"
        onClick={() => ctx.handleSubmit(undefined, 'ask_before_edit', undefined, true)}
      >
        Send inverted
      </button>
      {ctx.queuedMessages.map(m => (
        <button key={m.id} data-testid={`cancel-${m.id}`} onClick={() => ctx.cancelQueuedMessage(m.id)}>
          Cancel {m.content}
        </button>
      ))}
    </div>
  );
}

describe('queued follow-up message integration', () => {
  const bridgeHandlers = new Map<string, Set<(msg: IPCMessage) => void>>();

  function emitBridgeEvent(type: string, payload: Record<string, unknown>) {
    const msg: IPCMessage = { type, payload, timestamp: Date.now() };
    bridgeHandlers.get(type)?.forEach((h) => h(msg));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    bridgeHandlers.clear();
    composerFollowUpBehavior = FollowUpBehavior.Queue;
    mockSession.currentSessionId = 'queue-session';

    mockBridge.subscribe.mockImplementation((type: string, handler: (msg: IPCMessage) => void) => {
      if (!bridgeHandlers.has(type)) bridgeHandlers.set(type, new Set());
      bridgeHandlers.get(type)!.add(handler);
      return () => { bridgeHandlers.get(type)?.delete(handler); };
    });
    mockBridge.send.mockResolvedValue({ status: 'ok', queue: [] });
  });

  async function startStreaming() {
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'working...' } },
      });
    });
    await waitFor(() => expect(screen.getByTestId('is-streaming')).toHaveTextContent('true'));
  }

  it('sends QUEUE_MESSAGE instead of SEND_MESSAGE when submitting mid-stream in queue mode', async () => {
    render(<TestWrapper><TestChatComponent /></TestWrapper>);
    await startStreaming();

    await act(async () => {
      fireEvent.change(screen.getByTestId('input'), { target: { value: 'follow-up while busy' } });
      fireEvent.click(screen.getByTestId('submit'));
    });

    await waitFor(() => {
      expect(mockBridge.send).toHaveBeenCalledWith(MessageType.QUEUE_MESSAGE, expect.objectContaining({
        sessionId: 'queue-session',
        content: 'follow-up while busy',
        workingDir: '/test',
      }));
    });
    expect(mockBridge.send.mock.calls.some(call => call[0] === MessageType.SEND_MESSAGE)).toBe(false);
    // The composer clears immediately, same as an ordinary send — the message
    // moved from "being typed" to "queued", not to nowhere.
    expect(screen.getByTestId('input')).toHaveValue('');
  });

  // The setting's description promises a key that does the opposite for one
  // message. These two cover both directions of that promise; without them the
  // description can go on saying it while the key quietly sends as usual.
  it('sends straight through when the derived key inverts queue mode for one message', async () => {
    render(<TestWrapper><TestChatComponent /></TestWrapper>);
    await startStreaming();

    await act(async () => {
      fireEvent.change(screen.getByTestId('input'), { target: { value: 'jump the queue' } });
      fireEvent.click(screen.getByTestId('submit-inverted'));
    });

    await waitFor(() => {
      expect(mockBridge.send).toHaveBeenCalledWith(MessageType.SEND_MESSAGE, expect.objectContaining({
        sessionId: 'queue-session',
        content: 'jump the queue',
      }));
    });
    expect(mockBridge.send.mock.calls.some(call => call[0] === MessageType.QUEUE_MESSAGE)).toBe(false);
  });

  it('queues when the derived key inverts steer mode for one message', async () => {
    composerFollowUpBehavior = FollowUpBehavior.Steer;
    render(<TestWrapper><TestChatComponent /></TestWrapper>);
    await startStreaming();

    await act(async () => {
      fireEvent.change(screen.getByTestId('input'), { target: { value: 'hold this one' } });
      fireEvent.click(screen.getByTestId('submit-inverted'));
    });

    await waitFor(() => {
      expect(mockBridge.send).toHaveBeenCalledWith(MessageType.QUEUE_MESSAGE, expect.objectContaining({
        sessionId: 'queue-session',
        content: 'hold this one',
      }));
    });
  });

  it('leaves the setting alone, so the next message follows it again', async () => {
    render(<TestWrapper><TestChatComponent /></TestWrapper>);
    await startStreaming();

    await act(async () => {
      fireEvent.change(screen.getByTestId('input'), { target: { value: 'jump the queue' } });
      fireEvent.click(screen.getByTestId('submit-inverted'));
    });
    await waitFor(() => {
      expect(mockBridge.send.mock.calls.some(call => call[0] === MessageType.SEND_MESSAGE)).toBe(true);
    });

    // Same composer, plain send this time: queue mode is still in force.
    await act(async () => {
      fireEvent.change(screen.getByTestId('input'), { target: { value: 'back to queueing' } });
      fireEvent.click(screen.getByTestId('submit'));
    });

    await waitFor(() => {
      expect(mockBridge.send).toHaveBeenCalledWith(MessageType.QUEUE_MESSAGE, expect.objectContaining({
        content: 'back to queueing',
      }));
    });
  });

  it('still sends SEND_MESSAGE while idle even with queue mode selected (feature A unchanged)', async () => {
    render(<TestWrapper><TestChatComponent /></TestWrapper>);
    // Not streaming — the "queue" setting only ever applies mid-turn.
    expect(screen.getByTestId('is-streaming')).toHaveTextContent('false');

    await act(async () => {
      fireEvent.change(screen.getByTestId('input'), { target: { value: 'first message' } });
      fireEvent.click(screen.getByTestId('submit'));
    });

    await waitFor(() => {
      expect(mockBridge.send).toHaveBeenCalledWith(MessageType.SEND_MESSAGE, expect.objectContaining({
        content: 'first message',
      }));
    });
    expect(mockBridge.send.mock.calls.some(call => call[0] === MessageType.QUEUE_MESSAGE)).toBe(false);
  });

  it('reflects the queue exactly as QUEUED_MESSAGES_CHANGED reports it', async () => {
    render(<TestWrapper><TestChatComponent /></TestWrapper>);

    await act(async () => {
      emitBridgeEvent(MessageType.QUEUED_MESSAGES_CHANGED, {
        sessionId: 'queue-session',
        queue: [
          { id: 'q-1', content: 'first queued', queuedAt: 1 },
          { id: 'q-2', content: 'second queued', queuedAt: 2 },
        ],
      });
    });

    expect(screen.getByTestId('queue-count')).toHaveTextContent('2');
    expect(screen.getByTestId('queue-contents')).toHaveTextContent('first queued|second queued');
  });

  it('ignores a QUEUED_MESSAGES_CHANGED push for a different session', async () => {
    render(<TestWrapper><TestChatComponent /></TestWrapper>);

    await act(async () => {
      emitBridgeEvent(MessageType.QUEUED_MESSAGES_CHANGED, {
        sessionId: 'some-other-session',
        queue: [{ id: 'q-x', content: 'not for us', queuedAt: 1 }],
      });
    });

    expect(screen.getByTestId('queue-count')).toHaveTextContent('0');
  });

  it('sends CANCEL_QUEUED_MESSAGE with the matching id when the cancel button is clicked', async () => {
    render(<TestWrapper><TestChatComponent /></TestWrapper>);

    await act(async () => {
      emitBridgeEvent(MessageType.QUEUED_MESSAGES_CHANGED, {
        sessionId: 'queue-session',
        queue: [{ id: 'q-1', content: 'cancel me', queuedAt: 1 }],
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('cancel-q-1'));
    });

    expect(mockBridge.send).toHaveBeenCalledWith(MessageType.CANCEL_QUEUED_MESSAGE, {
      sessionId: 'queue-session',
      id: 'q-1',
    });

    // The backend, not this click, is what actually empties the list — the
    // click only asks. Simulate its follow-up push to confirm the round trip.
    await act(async () => {
      emitBridgeEvent(MessageType.QUEUED_MESSAGES_CHANGED, { sessionId: 'queue-session', queue: [] });
    });
    expect(screen.getByTestId('queue-count')).toHaveTextContent('0');
  });
});
