import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import React from 'react';
import { ChatStreamProvider, useChatStreamContext } from '../contexts/ChatStreamContext';
import { ChatInputStateProvider, useChatInputState } from '../contexts/ChatInputStateContext';
import {
  AccountPoolStrategy,
  MessageType,
  ScheduledMessageKind,
  type AccountListItem,
  type AccountPool,
  type AccountPoolRecoveryResult,
  type ScheduledMessage,
} from '@/shared';
import { LimitReachedRenderer } from '../pages/ChatPage/message-renderers/LimitReachedRenderer';
import { isLimitErrorMessage } from '../types';
import { i18n } from '../i18n';
import { AutoResumeProvider, useAutoResumeContext } from '../contexts/AutoResumeContext';

// Mock requestAnimationFrame/cancelAnimationFrame
globalThis.requestAnimationFrame = vi.fn((cb) => {
  cb(0);
  return 0;
});
globalThis.cancelAnimationFrame = vi.fn();

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock BridgeContext
const mockBridge = {
  isConnected: true,
  send: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(),
  lastMessage: null,
  connectionStatus: 'connected' as const,
};

vi.mock('../contexts/BridgeContext', () => ({
  useBridgeContext: () => mockBridge,
  BridgeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock SessionContext
const mockSession = {
  currentSessionId: null as string | null,
  sessions: [],
  sessionState: 'idle' as const,
  isLoading: false,
  workingDirectory: '/test',
  inputMode: 'ask_before_edit' as const,
  // 컴포저가 CLI에 요구할 모드. 이 테스트들은 모드가 이미 정해진 세션에서 출발하므로
  // inputMode와 같은 값으로 둔다.
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

let resumeAccounts: AccountListItem[] = [];
let resumePools: AccountPool[] = [];
let resumeReservations: ScheduledMessage[] = [];
const switchAccountMock = vi.fn(async (id: string) => {
  resumeAccounts = resumeAccounts.map(account => ({ ...account, active: account.id === id }));
});
vi.mock('../hooks/queries/useAccounts', () => ({
  useAccounts: () => ({ accounts: resumeAccounts, accountPools: resumePools, switchTo: switchAccountMock }),
}));
vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { autoResumeOnLimit: true } }),
}));
vi.mock('../contexts/AutoResumeOverrideContext', () => ({
  useAutoResumeOverride: () => ({ getOverride: () => undefined }),
}));
vi.mock('../contexts/ScheduledMessagesContext', () => ({
  useScheduledMessages: () => ({ reservations: resumeReservations }),
}));
vi.mock('../utils/ensureSponsor', () => ({ ensureSponsor: vi.fn().mockResolvedValue(true) }));
vi.mock('../notifications', () => ({ notify: vi.fn() }));
vi.mock('../api/ClaudeCodeApi', () => ({ api: {}, getApi: () => ({}), ClaudeCodeApi: class {} }));

function TestAutoResumeComponent() {
  const resume = useAutoResumeContext();
  const { messages } = useChatStreamContext();
  return <><div data-testid="auto-resume-action">{resume.action ?? 'none'}</div>
    <div data-testid="limit-notices">{messages.filter(isLimitErrorMessage).map(message =>
      <LimitReachedRenderer key={message.uuid} message={message} />)}</div></>;
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  const inputRef = React.useRef('');
  const setInputCallbackRef = React.useRef<(value: string) => void>(() => {});
  const setInput = React.useCallback((value: string) => {
    setInputCallbackRef.current(value);
  }, []);
  return (
    // ChatStreamProvider reads the router: a session opened by forking carries the
    // origin on the navigation, and the provider spends it on the first send
    // (issue #356). In the app there is always a router above it.
    <MemoryRouter>
      <ChatStreamProvider setInput={setInput} inputRef={inputRef}>
        <ChatInputStateProvider inputRef={inputRef} setInputCallbackRef={setInputCallbackRef}>
          {children}
        </ChatInputStateProvider>
      </ChatStreamProvider>
    </MemoryRouter>
  );
}

// Test component that uses ChatStreamContext
function TestChatComponent() {
  const ctx = useChatStreamContext();
  const { input, setInput } = useChatInputState();
  return (
    <div>
      <div data-testid="messages-count">{ctx.messages.length}</div>
      <div data-testid="is-streaming">{String(ctx.isStreaming)}</div>
      <div data-testid="error">{ctx.error?.message || 'none'}</div>
      <div data-testid="streaming-id">{ctx.streamingMessageId || 'none'}</div>
      <input
        data-testid="input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button data-testid="submit" onClick={() => ctx.handleSubmit(undefined, 'ask_before_edit')}>
        Send
      </button>
      <button data-testid="stop" onClick={ctx.stop}>
        Stop
      </button>
      <button data-testid="continue" onClick={ctx.continue}>
        Continue
      </button>
      <button data-testid="submit-with-mode" onClick={() => {
        ctx.sendMessage('Hello with mode', 'plan', undefined);
      }}>
        Send with Mode
      </button>
      <div data-testid="messages">
        {ctx.messages.map((m) => (
          <div key={m.uuid} data-testid={`msg-${m.type}`}>
            {typeof m.message?.content === 'string'
              ? m.message.content
              : Array.isArray(m.message?.content)
                ? (m.message!.content as Array<{type: string; text?: string}>)
                    .filter((b) => b.type === 'text')
                    .map((b) => b.text ?? '')
                    .join('')
                : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

describe('채팅 스트리밍 통합 테스트', () => {
  const bridgeHandlers = new Map<string, Set<(msg: IPCMessage) => void>>();

  function emitBridgeEvent(type: string, payload: Record<string, unknown>) {
    const msg: IPCMessage = { type, payload, timestamp: Date.now() };
    bridgeHandlers.get(type)?.forEach((h) => h(msg));
  }

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    bridgeHandlers.clear();
    mockSession.requestedInputMode = 'ask_before_edit';

    // Setup bridge.subscribe to capture handlers
    mockBridge.subscribe.mockImplementation(
      (type: string, handler: (msg: IPCMessage) => void) => {
        if (!bridgeHandlers.has(type)) {
          bridgeHandlers.set(type, new Set());
        }
        bridgeHandlers.get(type)!.add(handler);
        return () => {
          bridgeHandlers.get(type)?.delete(handler);
        };
      }
    );

    // Reset session mock state
    mockSession.currentSessionId = null;
    resumeAccounts = [];
    resumePools = [];
    resumeReservations = [];
    mockBridge.send.mockResolvedValue(undefined);
  });

  afterEach(() => {
    bridgeHandlers.clear();
  });

  it.each([false, true])('스트리밍 도중 한도에 도달해도 새로고침 없이 자동재개를 예약한다 (계정 풀: %s)', async (withPool) => {
    mockSession.currentSessionId = 'stream-limit-session';
    await i18n.changeLanguage('ko');
    const resetsAt = new Date(Date.now() + 300_000).toISOString();
    const selectedResetsAt = withPool ? new Date(Date.now() + 120_000).toISOString() : resetsAt;
    if (withPool) {
      resumeAccounts = ['acc-1', 'acc-2'].map((id, index) => ({
        id, active: index === 0, emailAddress: `${id}@example.com`, displayName: null,
        organizationName: null, subscriptionType: 'max', authMethod: 'claudeai',
        createdAt: 1, updatedAt: 1, usageCached: null, usageCachedAt: 0,
      }));
      resumePools = [{
        id: 'pool-1', name: 'Pool', provider: 'claude', enabled: true,
        strategy: AccountPoolStrategy.ORDERED, accountIds: ['acc-1', 'acc-2'],
        createdAt: 1, updatedAt: 1,
      }];
    }
    let finishPreparation: (result: AccountPoolRecoveryResult) => void = () => {};
    mockBridge.send.mockImplementation((type: string) => type === MessageType.PREPARE_ACCOUNT_POOL_RECOVERY
      ? new Promise<AccountPoolRecoveryResult>(resolve => { finishPreparation = resolve; })
      : Promise.resolve({ status: 'ok' }));

    const { rerender } = render(
      <TestWrapper><AutoResumeProvider><TestChatComponent /><TestAutoResumeComponent /></AutoResumeProvider></TestWrapper>,
    );
    fireEvent.change(screen.getByTestId('input'), { target: { value: 'Continue the task' } });
    fireEvent.click(screen.getByTestId('submit'));
    expect(screen.getByTestId('is-streaming')).toHaveTextContent('true');

    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'stream_event', event: { type: 'message_start', message: { id: 'msg-tool' } },
      });
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'stream_event', event: {
          type: 'content_block_delta', delta: { type: 'text_delta', text: 'Checking files' },
        },
      });
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'assistant', message: { id: 'msg-tool', role: 'assistant', content: [
          { type: 'text', text: 'Checking files' },
          { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'pwd' } },
        ] },
      });
    });
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'user', message: { role: 'user', content: [
          { type: 'tool_result', tool_use_id: 'tool-1', content: '/test' },
        ] },
      });
      // This synthetic error has no message_start or deltas of its own.
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'assistant', uuid: 'limit-entry', timestamp: new Date().toISOString(),
        is_api_error_message: true, api_error_status: 429, error: 'rate_limit',
        message: { id: 'synthetic-limit', role: 'assistant', model: '<synthetic>', content: [
          { type: 'text', text: `You've hit your session limit · resets ${resetsAt}` },
        ] },
      });
    });
    // The terminal result arrives separately, after the limit has started the pool switch.
    await act(async () => emitBridgeEvent(MessageType.CLI_EVENT, { type: 'result', is_error: true }));
    expect(screen.getByTestId('is-streaming')).toHaveTextContent('false');
    if (withPool) {
      expect(mockBridge.send.mock.calls.find(call => call[0] === MessageType.PREPARE_ACCOUNT_POOL_RECOVERY)?.[1]).toMatchObject({ sourceMessageUuid: 'limit-entry' });
      expect(switchAccountMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('auto-resume-action')).toHaveTextContent('none');
      expect(mockBridge.send.mock.calls.filter(call => call[0] === MessageType.SCHEDULE_MESSAGE)).toHaveLength(0);
      expect(screen.getByTestId('limit-notices').querySelector('.animate-spin')).not.toBeNull();
      await act(async () => finishPreparation({ recovery: { accountId: 'acc-2', sourceMessageUuid: 'limit-entry',
        resetsAt: selectedResetsAt, awaitingLimit: true }, continueInSession: true }));
      mockBridge.send.mockImplementation((type: string) => Promise.resolve(type === MessageType.PREPARE_ACCOUNT_POOL_RECOVERY
        ? { recovery: { accountId: 'acc-2', sourceMessageUuid: 'limit-entry', resetsAt: selectedResetsAt, awaitingLimit: false }, continueInSession: false }
        : { status: 'ok' }));
      expect(screen.getByTestId('auto-resume-action')).toHaveTextContent('none');
      await act(async () => {
        emitBridgeEvent(MessageType.CLI_EVENT, { type: 'assistant', uuid: 'company-limit-entry', timestamp: new Date().toISOString(),
          is_api_error_message: true, api_error_status: 429, error: 'rate_limit',
          message: { id: 'company-limit', role: 'assistant', model: '<synthetic>', content: [
            { type: 'text', text: `You've hit your session limit · resets ${selectedResetsAt}` },
          ] } });
        emitBridgeEvent(MessageType.CLI_EVENT, { type: 'result', is_error: true });
      });
      expect(switchAccountMock).not.toHaveBeenCalled();
    }
    expect(screen.getByTestId('auto-resume-action')).toHaveTextContent('schedule');
    expect(mockBridge.send).toHaveBeenCalledWith(MessageType.SCHEDULE_MESSAGE, {
      sessionId: 'stream-limit-session', sendAt: new Date(Date.parse(selectedResetsAt) + 30_000).toISOString(),
      message: 'continue', kind: ScheduledMessageKind.AUTO_RESUME, model: undefined,
    });
    rerender(<TestWrapper><AutoResumeProvider><TestChatComponent /><TestAutoResumeComponent /></AutoResumeProvider></TestWrapper>);
    expect(mockBridge.send.mock.calls.filter(call => call[0] === MessageType.SCHEDULE_MESSAGE)).toHaveLength(1);
    expect(mockBridge.send.mock.calls.filter(call => call[0] === MessageType.SEND_MESSAGE)).toHaveLength(withPool ? 2 : 1);
    expect(screen.queryByText(i18n.t('chat:autoResume.scheduled'))).not.toBeInTheDocument();
    resumeReservations = [{ id: 'reserved', sessionId: 'stream-limit-session',
      sendAt: new Date(Date.parse(selectedResetsAt) + 30_000).toISOString(),
      message: 'continue', kind: ScheduledMessageKind.AUTO_RESUME, createdAt: new Date().toISOString(), accountId: 'acc-2' }];
    rerender(<TestWrapper><AutoResumeProvider><TestChatComponent /><TestAutoResumeComponent /></AutoResumeProvider></TestWrapper>);
    expect(screen.getByText(i18n.t('chat:autoResume.scheduled'))).toBeInTheDocument();
    const notice = within(screen.getByTestId('limit-notices')).getByText(`You've hit your session limit · resets ${selectedResetsAt}`);
    expect(notice.parentElement).toHaveTextContent(i18n.t('chat:autoResume.scheduled'));
    expect(notice.parentElement?.querySelector('time')).toBeNull();
  });

  it('초기 상태가 올바르다', () => {
    render(
      <TestWrapper>
        <TestChatComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId('messages-count')).toHaveTextContent('0');
    expect(screen.getByTestId('is-streaming')).toHaveTextContent('false');
    expect(screen.getByTestId('error')).toHaveTextContent('none');
    expect(screen.getByTestId('streaming-id')).toHaveTextContent('none');
    expect(screen.getByTestId('input')).toHaveValue('');
  });

  it('sendMessage: user 메시지가 추가되고 bridge.send가 호출된다', async () => {
    mockSession.currentSessionId = 'existing-session';

    render(
      <TestWrapper>
        <TestChatComponent />
      </TestWrapper>
    );

    const input = screen.getByTestId('input');
    const submit = screen.getByTestId('submit');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Hello' } });
    });

    await act(async () => {
      fireEvent.click(submit);
    });

    // addUserMessage creates 2 messages: user + assistant placeholder
    await waitFor(() => {
      expect(screen.getByTestId('messages-count')).toHaveTextContent('2');
    });

    expect(screen.getByTestId('msg-user')).toHaveTextContent('Hello');
    expect(mockBridge.send).toHaveBeenCalledWith(MessageType.SEND_MESSAGE, expect.objectContaining({
      content: 'Hello',
      context: [],
      inputMode: 'ask_before_edit',
      isNewSession: false,
      sessionId: 'existing-session',
      workingDir: '/test',
    }));
    expect(screen.getByTestId('input')).toHaveValue('');
  });

  it('sendMessage: inputMode가 bridge.send payload에 포함된다', async () => {
    mockSession.currentSessionId = 'existing-session';
    // 사용자가 plan을 고른 상태 — 페이로드에는 이 모드가 실려야 한다
    mockSession.requestedInputMode = 'plan';

    render(
      <TestWrapper>
        <TestChatComponent />
      </TestWrapper>
    );

    const submitWithMode = screen.getByTestId('submit-with-mode');

    await act(async () => {
      fireEvent.click(submitWithMode);
    });

    await waitFor(() => {
      expect(screen.getByTestId('messages-count')).toHaveTextContent('2');
    });

    expect(mockBridge.send).toHaveBeenCalledWith(MessageType.SEND_MESSAGE, expect.objectContaining({
      content: 'Hello with mode',
      inputMode: 'plan',
    }));
  });

  it('CLI_EVENT(stream_event) 수신: assistant 메시지에 text가 축적된다', async () => {
    mockSession.currentSessionId = 'test-session';

    render(
      <TestWrapper>
        <TestChatComponent />
      </TestWrapper>
    );

    const input = screen.getByTestId('input');
    const submit = screen.getByTestId('submit');

    // Send user message - creates user + assistant placeholder
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(screen.getByTestId('messages-count')).toHaveTextContent('2');
    });

    // Simulate stream deltas via CLI_EVENT channel
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: 'Hello',
          },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('true');
    });

    expect(screen.getByTestId('messages-count')).toHaveTextContent('2'); // user + assistant
    expect(screen.getByTestId('msg-assistant')).toHaveTextContent('Hello');

    // Simulate more stream chunks
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: ' world',
          },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('msg-assistant')).toHaveTextContent('Hello world');
    });
  });

  it('CLI_EVENT(result) 수신: isStreaming이 false로 전환된다', async () => {
    mockSession.currentSessionId = 'test-session';

    render(
      <TestWrapper>
        <TestChatComponent />
      </TestWrapper>
    );

    // Start streaming
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: 'Test',
          },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('true');
    });

    // End streaming via result event
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'result',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('streaming-id')).toHaveTextContent('none');
  });

  // Regression for #196 (/context returns nothing): local slash commands emit a
  // complete `assistant` event immediately followed by `result`, with NO partial
  // stream_events. Both land in the same React batch, so `result`'s endStreaming()
  // nulls streamingMessageIdRef before the `assistant` handler's setMessages updater
  // runs. If that updater reads the ref (instead of a value captured up-front), it
  // matches no message and the finished content is dropped. This asserts the
  // placeholder is replaced with the assistant content even in that ordering.
  it('CLI_EVENT: partial 없이 assistant(완성본)+result가 연속 도착해도 placeholder가 교체된다 (#196)', async () => {
    mockSession.currentSessionId = 'test-session';

    render(
      <TestWrapper>
        <TestChatComponent />
      </TestWrapper>
    );

    const input = screen.getByTestId('input');
    const submit = screen.getByTestId('submit');

    // user 메시지 → user + assistant placeholder(스트리밍 중)
    await act(async () => {
      fireEvent.change(input, { target: { value: '/context' } });
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(screen.getByTestId('messages-count')).toHaveTextContent('2');
    });

    // 같은 배치에서 assistant(완성본) → result 연속 emit (partial stream_event 없음).
    // result의 endStreaming이 ref를 null로 만든 뒤 assistant의 setMessages가 flush된다.
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'assistant',
        message: {
          id: 'asst_ctx_1',
          role: 'assistant',
          content: [{ type: 'text', text: '## Context Usage\n\n**Tokens:** 28.2k / 1m (3%)' }],
        },
      });
      emitBridgeEvent(MessageType.CLI_EVENT, { type: 'result', subtype: 'success' });
    });

    // placeholder가 완성본으로 교체되어 내용이 렌더되어야 한다 (유실 시 빈 문자열).
    await waitFor(() => {
      expect(screen.getByTestId('msg-assistant')).toHaveTextContent('Context Usage');
    });
    expect(screen.getByTestId('is-streaming')).toHaveTextContent('false');
  });

  it('SERVICE_ERROR 수신: error 상태가 설정된다', async () => {
    mockSession.currentSessionId = 'test-session';

    render(
      <TestWrapper>
        <TestChatComponent />
      </TestWrapper>
    );

    await act(async () => {
      emitBridgeEvent(MessageType.SERVICE_ERROR, {
        type: 'ERROR_TYPE',
        reason: 'API error message',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Service error: ERROR_TYPE - API error message');
    });

    expect(screen.getByTestId('is-streaming')).toHaveTextContent('false');
  });

  it('stop: STOP_SESSION이 bridge로 전송되고, result 수신 후 isStreaming=false', async () => {
    mockSession.currentSessionId = 'test-session';

    render(
      <TestWrapper>
        <TestChatComponent />
      </TestWrapper>
    );

    // Start streaming
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: 'Test',
          },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('true');
    });

    // Stop streaming — sends interrupt signal
    const stopButton = screen.getByTestId('stop');
    await act(async () => {
      fireEvent.click(stopButton);
    });

    expect(mockBridge.send).toHaveBeenCalledWith(MessageType.STOP_SESSION, {});

    // CLI responds with result event to end streaming
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'result',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('false');
    });
  });

  it('전체 흐름: 입력 → sendMessage → CLI_EVENT(stream) → CLI_EVENT(result) → 완료', async () => {
    mockSession.currentSessionId = 'test-session';

    render(
      <TestWrapper>
        <TestChatComponent />
      </TestWrapper>
    );

    const input = screen.getByTestId('input');
    const submit = screen.getByTestId('submit');

    // 1. User inputs message - creates user + assistant placeholder
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Complete test' } });
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(screen.getByTestId('messages-count')).toHaveTextContent('2');
    });

    expect(screen.getByTestId('msg-user')).toHaveTextContent('Complete test');

    // 2. Start streaming via CLI_EVENT
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: 'Response',
          },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('true');
    });

    expect(screen.getByTestId('messages-count')).toHaveTextContent('2');
    expect(screen.getByTestId('msg-assistant')).toHaveTextContent('Response');

    // 3. More stream chunks
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: ' part 2',
          },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('msg-assistant')).toHaveTextContent('Response part 2');
    });

    // 4. Complete streaming via result
    await act(async () => {
      emitBridgeEvent(MessageType.CLI_EVENT, {
        type: 'result',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('streaming-id')).toHaveTextContent('none');
    expect(screen.getByTestId('error')).toHaveTextContent('none');

    // Verify final state
    expect(screen.getByTestId('messages-count')).toHaveTextContent('2');
    expect(screen.getAllByTestId(/^msg-/).length).toBe(2);
  });
});
