import { describe, it, expect, vi } from 'vitest';
import { CliPassthroughCommand } from '../CliPassthroughCommand';
import { InputModeValues, type InputMode } from '@/types/chatInput';
import { SessionState } from '@/types';
import type { CommandPaletteServices } from '../../../types';
import type { SlashCommandInfo } from '@/types/slashCommand';

function makeServices(overrides: {
  inputMode: InputMode;
  input?: string;
}): { services: CommandPaletteServices; sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessage = vi.fn();
  const services: CommandPaletteServices = {
    chatStream: {
      messages: [],
      isStreaming: false,
      input: overrides.input ?? '',
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
      inputMode: overrides.inputMode,
      setSessionState: vi.fn(),
      resetToNewSession: vi.fn(),
    },
    adapter: {
      openNewTab: vi.fn().mockResolvedValue(undefined),
      openSettings: vi.fn().mockResolvedValue(undefined),
      openTerminal: vi.fn().mockResolvedValue(undefined),
    },
    ui: {
      confirm: vi.fn().mockResolvedValue(true),
    },
    workflowState: {
      openPanel: vi.fn(),
    },
  };
  return { services, sendMessage };
}

function makeCommand(services: CommandPaletteServices, info: Partial<SlashCommandInfo> = {}): CliPassthroughCommand {
  const cmd = new CliPassthroughCommand({
    name: info.name ?? 'dummy',
    description: info.description ?? 'dummy command',
    argumentHint: info.argumentHint ?? '',
  });
  cmd._bind(() => services);
  return cmd;
}

describe('CliPassthroughCommand.execute', () => {
  // Regression test for bug where palette-launched slash commands hardcoded
  // AUTO_EDIT (acceptEdits), ignoring the user's selected InputModeTag.
  // See bb87c3a (textarea Enter path) — palette Enter path was missed.
  it('sends with the current session inputMode (BYPASS)', async () => {
    const { services, sendMessage } = makeServices({ inputMode: InputModeValues.BYPASS });
    const cmd = makeCommand(services);

    await cmd.execute();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('/dummy', InputModeValues.BYPASS);
  });

  it('sends with PLAN mode when session is in plan mode', async () => {
    const { services, sendMessage } = makeServices({ inputMode: InputModeValues.PLAN });
    const cmd = makeCommand(services);

    await cmd.execute();

    expect(sendMessage).toHaveBeenCalledWith('/dummy', InputModeValues.PLAN);
  });

  it('does not hardcode AUTO_EDIT when user mode is ASK_BEFORE_EDIT', async () => {
    const { services, sendMessage } = makeServices({ inputMode: InputModeValues.ASK_BEFORE_EDIT });
    const cmd = makeCommand(services);

    await cmd.execute();

    expect(sendMessage).toHaveBeenCalledWith('/dummy', InputModeValues.ASK_BEFORE_EDIT);
    expect(sendMessage).not.toHaveBeenCalledWith(expect.anything(), InputModeValues.AUTO_EDIT);
  });

  it('sends only the command label when invoked from palette click (input does not start with label)', async () => {
    const { services, sendMessage } = makeServices({
      inputMode: InputModeValues.BYPASS,
      input: '',
    });
    const cmd = makeCommand(services);

    await cmd.execute();

    expect(sendMessage).toHaveBeenCalledWith('/dummy', InputModeValues.BYPASS);
  });

  it('sends full input with args when user typed the command directly', async () => {
    const { services, sendMessage } = makeServices({
      inputMode: InputModeValues.BYPASS,
      input: '/dummy some args',
    });
    const cmd = makeCommand(services);

    await cmd.execute();

    expect(sendMessage).toHaveBeenCalledWith('/dummy some args', InputModeValues.BYPASS);
  });
});
