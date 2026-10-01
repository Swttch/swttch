import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { InputModeValues } from '@/types/chatInput';

/**
 * Regression for #497: opening the slash panel re-fetches the CLI config, and
 * that used to re-run the effect that copies `systemInit.permissionMode` onto the
 * composer. The copy is a fact about the moment `systemInit` arrived, so running
 * it again put the stale mode back over a mode the user had picked since and not
 * yet sent.
 *
 * The provider is mounted for real; only what it reads from is stubbed.
 */

const sessionState = {
  currentSessionId: null as string | null,
  inputMode: InputModeValues.ASK_BEFORE_EDIT as string,
  syncEffectiveMode: vi.fn(),
  notifyAutoFallback: vi.fn(),
  setAutoModeAvailable: vi.fn(),
  setSessionState: vi.fn(),
  setInputMode: vi.fn(),
};

const cliConfigState = {
  controlResponse: null as unknown,
  refresh: vi.fn(),
};

const chatStreamState = {
  systemInit: null as Record<string, unknown> | null,
};

const bridgeState = {
  isConnected: false,
  send: vi.fn(),
  subscribe: vi.fn(() => () => {}),
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
  useCliConfig: () => cliConfigState,
}));

vi.mock('../ClaudeSettingsContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ClaudeSettingsContext')>()),
  useClaudeSettings: () => ({ settings: {} }),
}));

vi.mock('../SettingsContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../SettingsContext')>()),
  useSettings: () => ({ settings: {} }),
}));

vi.mock('../../hooks/useTools', () => ({
  useTools: () => ({ clearToolUses: vi.fn() }),
}));

vi.mock('../../hooks/useDiffs', () => ({
  useDiffs: () => ({ clearDiffs: vi.fn() }),
}));

vi.mock('../../hooks/useControlRequestCommand', () => ({
  useControlRequestCommand: () => vi.fn(),
}));

vi.mock('../../hooks/useChatStream', () => ({
  useChatStream: () => ({
    messages: [],
    isStreaming: false,
    streamingMessageId: null,
    error: null,
    authDiagnosis: null,
    systemInit: chatStreamState.systemInit,
    disconnectCountdown: null,
    apiRetry: null,
    contextWindowUsage: null,
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

import { ChatStreamProvider } from '../ChatStreamContext';

// A fresh element per render: re-rendering the very same element object lets
// React bail out, which would make a "nothing re-ran" assertion pass vacuously.
const tree = () => (
  <ChatStreamProvider setInput={vi.fn()} inputRef={{ current: '' }}>
    <div />
  </ChatStreamProvider>
);

function mount() {
  const view = render(tree());
  return { rerender: () => view.rerender(tree()) };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.currentSessionId = null;
  cliConfigState.controlResponse = null;
  chatStreamState.systemInit = { model: 'claude-sonnet-5-5', permissionMode: 'bypassPermissions' };
});

describe('ChatStreamProvider permission mode sync', () => {
  it('copies the mode the CLI reported when systemInit arrives', () => {
    mount();
    expect(sessionState.syncEffectiveMode).toHaveBeenCalledTimes(1);
    expect(sessionState.syncEffectiveMode).toHaveBeenCalledWith(InputModeValues.BYPASS);
  });

  it('does not put the reported mode back when the CLI config is re-fetched (#497)', () => {
    const { rerender } = mount();
    expect(sessionState.syncEffectiveMode).toHaveBeenCalledTimes(1);

    // What opening the slash panel does: refreshCliConfig() resolves with a new object.
    cliConfigState.controlResponse = { response: { response: { models: [] } } };
    rerender();

    expect(sessionState.syncEffectiveMode).toHaveBeenCalledTimes(1);
  });

  it('copies the mode again when a new systemInit reports a different one', () => {
    const { rerender } = mount();

    chatStreamState.systemInit = { model: 'claude-sonnet-5-5', permissionMode: 'default' };
    rerender();

    expect(sessionState.syncEffectiveMode).toHaveBeenCalledTimes(2);
    expect(sessionState.syncEffectiveMode).toHaveBeenLastCalledWith(InputModeValues.ASK_BEFORE_EDIT);
  });
});
