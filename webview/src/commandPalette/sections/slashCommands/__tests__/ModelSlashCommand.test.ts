import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelSlashCommand } from '../ModelSlashCommand';
import { SWITCH_MODEL_EVENT } from '@/pages/ChatPage/ModelSwitchOverlay';
import { InputModeValues, type InputMode } from '@/types/chatInput';
import { SessionState } from '@/types';
import type { CommandPaletteServices } from '../../../types';

function makeServices(input: string, inputMode: InputMode = InputModeValues.BYPASS): {
  services: CommandPaletteServices;
  sendMessage: ReturnType<typeof vi.fn>;
} {
  const sendMessage = vi.fn();
  const services: CommandPaletteServices = {
    chatStream: {
      messages: [],
      isStreaming: false,
      input,
      setInput: vi.fn(),
      sendMessage,
      runControlRequestCommand: vi.fn(),
      stop: vi.fn(),
      continue: vi.fn(),
      clearMessages: vi.fn(),
      resetStreamState: vi.fn(),
      resetForSessionSwitch: vi.fn(),
    },
    session: {
      currentSessionId: null,
      sessionState: SessionState.Idle,
      workingDirectory: '/tmp',
      inputMode,
      setSessionState: vi.fn(),
      resetToNewSession: vi.fn(),
    },
    adapter: {
      openNewTab: vi.fn().mockResolvedValue(undefined),
      openSettings: vi.fn().mockResolvedValue(undefined),
      openTerminal: vi.fn().mockResolvedValue(undefined),
    },
    ui: { confirm: vi.fn().mockResolvedValue(true) },
    workflowState: { openPanel: vi.fn() },
  };
  return { services, sendMessage };
}

function makeCommand(services: CommandPaletteServices): ModelSlashCommand {
  const cmd = new ModelSlashCommand({ name: 'model', description: 'Set the AI model', argumentHint: '' });
  cmd._bind(() => services);
  return cmd;
}

describe('ModelSlashCommand.execute', () => {
  let dispatched: CustomEvent[];

  beforeEach(() => {
    dispatched = [];
    vi.spyOn(window, 'dispatchEvent').mockImplementation((e: Event) => {
      dispatched.push(e as CustomEvent);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the model overlay carrying the parsed arg as query ("/model sonnet")', async () => {
    const { services } = makeServices('/model sonnet');
    await makeCommand(services).execute();

    const evt = dispatched.find(e => e.type === SWITCH_MODEL_EVENT);
    expect(evt).toBeDefined();
    expect(evt!.detail).toEqual({ query: 'sonnet' });
  });

  it('opens the overlay with no query when there is no arg ("/model")', async () => {
    const { services } = makeServices('/model');
    await makeCommand(services).execute();

    const evt = dispatched.find(e => e.type === SWITCH_MODEL_EVENT);
    expect(evt).toBeDefined();
    expect(evt!.detail).toEqual({ query: undefined });
  });

  it('does NOT pass /model through to the CLI as a chat message', async () => {
    // The CLI rejects /model in stream-json mode ("isn't available in this
    // environment"), so it must never be sent as a user message.
    const { services, sendMessage } = makeServices('/model sonnet');
    await makeCommand(services).execute();

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
