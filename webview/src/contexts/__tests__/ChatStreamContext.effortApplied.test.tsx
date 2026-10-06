import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { InputModeValues } from '@/types/chatInput';
import { MessageType } from '@/shared';

/**
 * The CLI says, after a reply, what effort level the reply ran at (EFFORT_APPLIED). The
 * provider keeps that for the session on screen so the effort slider can show what
 * happened ahead of what was asked for. A report about another session must not repaint
 * this one, and the user moving the slider drops it.
 *
 * The provider is mounted for real; only what it reads from is stubbed.
 */

const sessionState = {
  currentSessionId: 's1' as string | null,
  inputMode: InputModeValues.ASK_BEFORE_EDIT as string,
  syncEffectiveMode: vi.fn(),
  notifyAutoFallback: vi.fn(),
  setAutoModeAvailable: vi.fn(),
  setSessionState: vi.fn(),
  setInputMode: vi.fn(),
};

const handlers = new Map<string, (message: unknown) => void>();
const bridgeState = {
  isConnected: true,
  send: vi.fn(() => Promise.resolve({})),
  subscribe: vi.fn((type: string, handler: (message: unknown) => void) => {
    handlers.set(type, handler);
    return () => { handlers.delete(type); };
  }),
};

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
vi.mock('../../hooks/useControlRequestCommand', () => ({ useControlRequestCommand: () => vi.fn() }));
vi.mock('../../hooks/useChatStream', () => ({
  useChatStream: () => ({
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
    addUserMessage: vi.fn(),
    addCommandEcho: vi.fn(),
    clearMessages: vi.fn(),
    loadMessages: vi.fn(),
    prependOlderMessages: vi.fn(),
    appendMessage: vi.fn(),
    updateMessage: vi.fn(),
    resetStreamState: vi.fn(),
    retry: vi.fn(),
  }),
}));

import { ChatStreamProvider, useChatStreamContext } from '../ChatStreamContext';

function Probe() {
  const { appliedEffort, clearAppliedEffort } = useChatStreamContext();
  return (
    <>
      <span data-testid="applied">{appliedEffort ?? 'none'}</span>
      <button onClick={clearAppliedEffort}>clear</button>
    </>
  );
}

const tree = () => (
  <ChatStreamProvider setInput={vi.fn()} inputRef={{ current: '' }}>
    <Probe />
  </ChatStreamProvider>
);

const applied = () => screen.getByTestId('applied').textContent;

function report(sessionId: string, effort: string | null) {
  act(() => {
    handlers.get(MessageType.EFFORT_APPLIED)?.({
      type: MessageType.EFFORT_APPLIED,
      payload: { sessionId, effort, perTurnEffort: effort },
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  sessionState.currentSessionId = 's1';
});

describe('the level the CLI reports having run at', () => {
  it('is none until a reply reports one', () => {
    render(tree());
    expect(applied()).toBe('none');
  });

  it('is kept for the session on screen', () => {
    render(tree());
    report('s1', 'high');
    expect(applied()).toBe('high');
  });

  it('is replaced by the next reply\'s, which is how a level that was changed shows up', () => {
    render(tree());
    report('s1', 'low');
    report('s1', 'xhigh');
    expect(applied()).toBe('xhigh');
  });

  it('ignores a report about a session that is not on screen', () => {
    render(tree());
    report('s2', 'max');
    expect(applied()).toBe('none');
  });

  it('is forgotten when the session changes, since another session\'s reply says nothing about this one', () => {
    const view = render(tree());
    report('s1', 'high');
    expect(applied()).toBe('high');

    sessionState.currentSessionId = 's2';
    view.rerender(tree());
    expect(applied()).toBe('none');
  });

  it('is dropped when the user moves the slider', () => {
    render(tree());
    report('s1', 'high');
    act(() => { screen.getByText('clear').click(); });
    expect(applied()).toBe('none');
  });

  it('treats a reply that carries no level as no level', () => {
    render(tree());
    report('s1', 'high');
    report('s1', null);
    expect(applied()).toBe('none');
  });
});
