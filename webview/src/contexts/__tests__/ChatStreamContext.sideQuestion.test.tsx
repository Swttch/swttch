import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { InputModeValues } from '@/types/chatInput';

/**
 * `/btw` is answered in its own window: the provider records the question, sends it as a
 * control_request under an id it chose, and keeps it out of the chat — even when the
 * request cannot be delivered, in which case the question fails in the window.
 *
 * The provider is mounted for real, with the real side-question provider beneath it; only
 * what it reads from is stubbed.
 */

const sessionState = {
  currentSessionId: 's1' as string | null,
  workingDirectory: '/w',
  requestedInputMode: null,
  inputMode: InputModeValues.ASK_BEFORE_EDIT as string,
  syncEffectiveMode: vi.fn(),
  notifyAutoFallback: vi.fn(),
  setAutoModeAvailable: vi.fn(),
  setSessionState: vi.fn(),
  setInputMode: vi.fn(),
  addNewSession: vi.fn(),
};

const handlers = new Map<string, (message: unknown) => void>();
const bridgeState = {
  isConnected: true,
  send: vi.fn(() => Promise.resolve({})),
  subscribe: vi.fn((type: string, handler: (message: unknown) => void) => {
    handlers.set(type, handler);
    return () => {};
  }),
};

const dispatch = vi.fn();
const addCommandEcho = vi.fn();
const addUserMessage = vi.fn();
let streamOptions: { onControlRequestResult?: (r: unknown) => void } = {};

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useLocation: () => ({ state: null }),
}));
vi.mock('../BridgeContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../BridgeContext')>()),
  useBridgeContext: () => bridgeState,
}));
vi.mock('../SessionContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../SessionContext')>()),
  useSessionContext: () => sessionState,
}));
vi.mock('../CliConfigContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../CliConfigContext')>()),
  useCliConfig: () => ({ controlResponse: null, refresh: vi.fn() }),
}));
vi.mock('../ClaudeSettingsContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ClaudeSettingsContext')>()),
  useClaudeSettings: () => ({ settings: {} }),
}));
vi.mock('../SettingsContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../SettingsContext')>()),
  useSettings: () => ({ settings: {} }),
}));
vi.mock('../../hooks/useTools', () => ({ useTools: () => ({ clearToolUses: vi.fn() }) }));
vi.mock('../../hooks/useDiffs', () => ({ useDiffs: () => ({ clearDiffs: vi.fn() }) }));
vi.mock('../../hooks/useControlRequestCommand', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useControlRequestCommand')>()),
  useControlRequestCommand: () => dispatch,
}));
vi.mock('../../hooks/useChatStream', () => ({
  useChatStream: (options: typeof streamOptions) => {
    streamOptions = options;
    return {
      messages: [],
      isStreaming: false,
      streamingMessageId: null,
      error: null,
      authDiagnosis: null,
      systemInit: null,
      disconnectCountdown: null,
      apiRetry: null,
      contextWindowUsage: null,
      applyContextWindow: vi.fn(),
      addUserMessage,
      addCommandEcho,
      clearMessages: vi.fn(),
      loadMessages: vi.fn(),
      prependOlderMessages: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      resetStreamState: vi.fn(),
      retry: vi.fn(),
    };
  },
}));

import { ChatStreamProvider, useChatStreamContext } from '../ChatStreamContext';
import { SideQuestionProvider, SideQuestionStatus, useSideQuestions } from '../SideQuestionContext';

function Probe() {
  const { runControlRequestCommand } = useChatStreamContext();
  const { exchanges, isOpen } = useSideQuestions();
  return (
    <>
      <button onClick={() => runControlRequestCommand('/btw why?', InputModeValues.ASK_BEFORE_EDIT)}>ask</button>
      <button onClick={() => runControlRequestCommand('/btw', InputModeValues.ASK_BEFORE_EDIT)}>bare</button>
      <span data-testid="open">{String(isOpen)}</span>
      <span data-testid="state">
        {exchanges.map((e) => `${e.requestId}|${e.question}|${e.status}|${e.answer ?? ''}`).join(';')}
      </span>
    </>
  );
}

const tree = () => (
  <SideQuestionProvider currentSessionId="s1">
    <ChatStreamProvider setInput={vi.fn()} inputRef={{ current: '' }}>
      <Probe />
    </ChatStreamProvider>
  </SideQuestionProvider>
);

const click = async (label: string) => {
  await act(async () => { screen.getByText(label).click(); });
};
const state = () => screen.getByTestId('state').textContent;
const dispatchedRequestId = () => dispatch.mock.calls[0][2] as string;

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  streamOptions = {};
  sessionState.currentSessionId = 's1';
  dispatch.mockImplementation((_input: string, _session: unknown, requestId: string) =>
    Promise.resolve({ command: {}, requestId, sent: true }),
  );
});

describe('/btw routing in ChatStreamContext', () => {
  it('records a pending exchange, sends it under the same request id, and keeps it out of the chat', async () => {
    render(tree());
    await click('ask');

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toBe('/btw why?');
    expect(dispatch.mock.calls[0][1]).toMatchObject({ sessionId: 's1' });
    expect(state()).toBe(`${dispatchedRequestId()}|why?|${SideQuestionStatus.Pending}|`);
    expect(screen.getByTestId('open').textContent).toBe('true');
    expect(addCommandEcho).not.toHaveBeenCalled();
    expect(addUserMessage).not.toHaveBeenCalled();
    expect(bridgeState.send).not.toHaveBeenCalledWith('SEND_MESSAGE', expect.anything());
  });

  it('only opens the window for a bare /btw', async () => {
    render(tree());
    await click('bare');

    expect(screen.getByTestId('open').textContent).toBe('true');
    expect(dispatch).not.toHaveBeenCalled();
    expect(addCommandEcho).not.toHaveBeenCalled();
    expect(state()).toBe('');
  });

  // Sending `/btw ...` to the chat as text would put a side question into the very
  // conversation it is meant to stay out of — and the CLI refuses it there anyway (#270).
  it('fails the exchange and keeps it out of the chat when the request is not sent', async () => {
    dispatch.mockImplementation((_i: string, _s: unknown, requestId: string) =>
      Promise.resolve({ command: {}, requestId, sent: false }),
    );
    render(tree());
    await click('ask');

    expect(state()).toContain(`|why?|${SideQuestionStatus.Failed}|`);
    expect(addUserMessage).not.toHaveBeenCalled();
    expect(bridgeState.send).not.toHaveBeenCalledWith('SEND_MESSAGE', expect.anything());
  });

  it('fails the exchange when the send itself throws', async () => {
    dispatch.mockImplementation(() => Promise.reject(new Error('socket closed')));
    render(tree());
    await click('ask');

    expect(state()).toContain(`|why?|${SideQuestionStatus.Failed}|`);
    expect(addUserMessage).not.toHaveBeenCalled();
  });

  // The backend sends STREAM_END when the CLI dies or never starts. The answer
  // would have come from that process, so a question still waiting on it never
  // gets one — fail it, the way the main chat stops its spinner on the same event.
  it('fails a question still waiting when the CLI process ends', async () => {
    render(tree());
    await click('ask');

    act(() => {
      handlers.get('STREAM_END')?.({ type: 'STREAM_END' });
    });

    expect(state()).toContain(`|why?|${SideQuestionStatus.Failed}|`);
  });

  // A deliberate restart (permission mode, effort, account) kills the CLI without a
  // STREAM_END; the replacement announces itself with STREAM_START. A question the old
  // process already had will never be answered by the new one.
  it('fails a question the previous CLI had when a new CLI starts for the session', async () => {
    render(tree());
    await click('ask');

    act(() => {
      handlers.get('STREAM_START')?.({ type: 'STREAM_START' });
    });

    expect(state()).toContain(`|why?|${SideQuestionStatus.Failed}|`);
  });

  // When `/btw` is what starts the CLI, STREAM_START arrives before the send is
  // acknowledged — the question is on its way to that very process.
  it('keeps waiting when the CLI starts before the question is delivered', async () => {
    let ack: (value: unknown) => void = () => {};
    dispatch.mockImplementation(() => new Promise((resolve) => { ack = resolve; }));
    render(tree());
    await click('ask');
    const requestId = dispatchedRequestId();

    act(() => {
      handlers.get('STREAM_START')?.({ type: 'STREAM_START' });
    });
    await act(async () => { ack({ command: {}, requestId, sent: true }); });

    expect(state()).toContain(`|why?|${SideQuestionStatus.Pending}|`);
  });

  it('settles the exchange as answered from a side_question result', async () => {
    render(tree());
    await click('ask');
    const requestId = dispatchedRequestId();

    act(() => {
      streamOptions.onControlRequestResult?.({ subtype: 'side_question', requestId, text: '42', isError: false });
    });

    expect(state()).toBe(`${requestId}|why?|${SideQuestionStatus.Answered}|42`);
    expect(addUserMessage).not.toHaveBeenCalled();
  });

  it('settles the exchange as failed when the result is an error', async () => {
    render(tree());
    await click('ask');
    const requestId = dispatchedRequestId();

    act(() => {
      streamOptions.onControlRequestResult?.({
        subtype: 'side_question',
        requestId,
        text: 'Command failed: boom',
        isError: true,
      });
    });

    expect(state()).toBe(`${requestId}|why?|${SideQuestionStatus.Failed}|Command failed: boom`);
  });
});
