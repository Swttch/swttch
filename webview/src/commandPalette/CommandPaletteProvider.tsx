import { createContext, useContext, useMemo, useRef, ReactNode } from 'react';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useChatInputState } from '@/contexts/ChatInputStateContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { getModelEffortConfig } from '@/types/effort';
import { resolveModelInfo } from '@/types/models';
import { getAdapter } from '@/adapters';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useWorkflowState } from '@/contexts/WorkflowStateContext';
import { SWITCH_MODEL_EVENT } from '@/pages/ChatPage/ModelSwitchOverlay';
import { ROTATE_MODEL_EVENT } from '@/pages/ChatPage/ChatInput/ModelTag';
import { PanelSection } from '@/types/commandPalette';
import type { SlashCommandInfo } from '@/types/slashCommand';
import { CommandPaletteServices } from './types';
import { CommandPaletteRegistry } from './CommandPaletteRegistry';
import { KeyboardRegistry } from './KeyboardRegistry';
import { applyModelCapabilityFlags } from './applyModelCapabilityFlags';
import {
  ContextSection,
  ModelSection,
  CustomizeSection,
  SlashCommandsSection,
  SettingsSection,
  SupportSection,
  ClearCommand,
  UsageCommand,
  CliPassthroughCommand,
  ModelSlashCommand,
  getContextItems,
  getModelItems,
  getCustomizeItems,
  getSettingsItems,
  getSupportItems,
} from './sections';

interface CommandPaletteRegistryContextValue {
  registry: CommandPaletteRegistry;
  keyboardRegistry: KeyboardRegistry;
  sections: PanelSection[];
}

const CommandPaletteRegistryContext = createContext<CommandPaletteRegistryContextValue | undefined>(undefined);

export function useCommandPaletteRegistry(): CommandPaletteRegistryContextValue {
  const context = useContext(CommandPaletteRegistryContext);
  if (!context) {
    throw new Error('useCommandPaletteRegistry must be used within a CommandPaletteProvider');
  }
  return context;
}

interface CommandPaletteProviderProps {
  children: ReactNode;
}

export function CommandPaletteProvider({ children }: CommandPaletteProviderProps) {
  const chatStream = useChatStreamContext();
  const chatInputState = useChatInputState();
  const session = useSessionContext();
  const { controlResponse } = useCliConfig();
  const { confirmDialog, confirm } = useConfirmDialog();
  const workflowState = useWorkflowState();
  const currentModel = useCurrentModel();

  // The Effort and fast-mode rows only make sense on models that support
  // them. Rather than hiding them on unsupported models (e.g. Haiku), we
  // keep them visible but disabled with a hover tooltip explaining why —
  // matching the pattern already used for other disabled rows in the panel.
  // See applyModelCapabilityFlags for where this is applied to the built
  // sections.
  const supportsEffort = getModelEffortConfig(controlResponse, currentModel).supportsEffort;
  const models = controlResponse?.response?.response?.models ?? [];
  const supportsFastMode = resolveModelInfo(models, currentModel)?.supportsFastMode ?? false;

  // Services ref - always points to current React state
  const servicesRef = useRef<CommandPaletteServices>({
    chatStream: {
      messages: chatStream.messages,
      isStreaming: chatStream.isStreaming,
      input: chatInputState.input,
      setInput: chatInputState.setInput,
      sendMessage: chatStream.sendMessage,
      stop: chatStream.stop,
      continue: chatStream.continue,
      clearMessages: chatStream.clearMessages,
      resetStreamState: chatStream.resetStreamState,
      resetForSessionSwitch: chatStream.resetForSessionSwitch,
    },
    session: {
      currentSessionId: session.currentSessionId,
      sessionState: session.sessionState,
      workingDirectory: session.workingDirectory,
      inputMode: session.inputMode,

      setSessionState: session.setSessionState,
      resetToNewSession: session.resetToNewSession,
    },
    adapter: {
      openNewTab: () => getAdapter().openNewTab(),
      openSettings: () => getAdapter().openSettings(),
      openTerminal: (workingDir) => getAdapter().openTerminal(workingDir),
    },
    ui: {
      confirm,
    },
    workflowState: {
      openPanel: workflowState.openPanel,
    },
  });

  // Update servicesRef on every render
  servicesRef.current = {
    chatStream: {
      messages: chatStream.messages,
      isStreaming: chatStream.isStreaming,
      input: chatInputState.input,
      setInput: chatInputState.setInput,
      sendMessage: chatStream.sendMessage,
      stop: chatStream.stop,
      continue: chatStream.continue,
      clearMessages: chatStream.clearMessages,
      resetStreamState: chatStream.resetStreamState,
      resetForSessionSwitch: chatStream.resetForSessionSwitch,
    },
    session: {
      currentSessionId: session.currentSessionId,
      sessionState: session.sessionState,
      workingDirectory: session.workingDirectory,
      inputMode: session.inputMode,

      setSessionState: session.setSessionState,
      resetToNewSession: session.resetToNewSession,
    },
    adapter: {
      openNewTab: () => getAdapter().openNewTab(),
      openSettings: () => getAdapter().openSettings(),
      openTerminal: (workingDir) => getAdapter().openTerminal(workingDir),
    },
    ui: {
      confirm,
    },
    workflowState: {
      openPanel: workflowState.openPanel,
    },
  };

  // Create registries once
  const { registry, keyboardRegistry } = useMemo(() => {
    const reg = new CommandPaletteRegistry(servicesRef);
    const keyboardReg = new KeyboardRegistry();

    // Register sections with their commands/items
    reg.registerSection(new ContextSection(), getContextItems());
    reg.registerSection(new ModelSection(), getModelItems());
    reg.registerSection(new CustomizeSection(), getCustomizeItems());
    reg.registerSection(new SlashCommandsSection(), [
      new ClearCommand(),
    ]);
    reg.registerSection(new SettingsSection(), getSettingsItems());
    reg.registerSection(new SupportSection(), getSupportItems());

    // Auto-register keyboard bindings from commands
    const bindings = reg.getKeyboardBindings();
    for (const binding of bindings) {
      keyboardReg.register({
        id: binding.id,
        match: binding.handler,
        execute: binding.execute,
      });
    }

    // Register non-command keyboard shortcuts
    keyboardReg.register({
      id: 'new-tab',
      match: (e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && e.key === 'n',
      execute: async () => {
        const newTabButton = document.getElementById('new-tab-button');
        if (newTabButton) newTabButton.click();
      },
    });

    keyboardReg.register({
      id: 'open-settings',
      match: (e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && e.key === ',',
      execute: async () => {
        await getAdapter().openSettings();
      },
    });

    keyboardReg.register({
      id: 'open-model-menu',
      match: (e: KeyboardEvent) =>
        (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'M' || e.key === 'm'),
      execute: async () => {
        window.dispatchEvent(new CustomEvent(SWITCH_MODEL_EVENT));
      },
    });

    keyboardReg.register({
      id: 'rotate-model',
      match: (e: KeyboardEvent) =>
        (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === '.' || e.key === '>'),
      execute: async () => {
        window.dispatchEvent(new CustomEvent(ROTATE_MODEL_EVENT));
      },
    });

    return { registry: reg, keyboardRegistry: keyboardReg };
  }, []);

  // Slash commands from CLI config (control_response)
  const commands = useMemo((): SlashCommandInfo[] => {
    return controlResponse?.response?.response?.commands ?? [];
  }, [controlResponse]);

  const sections = useMemo(() => {
    if (commands.length > 0) {
      const localCommands = [new ClearCommand(), new UsageCommand()];
      const localLabels: Set<string> = new Set(localCommands.map(c => c.label));
      const seen = new Set<string>();
      const dynamicCommands = commands
        .filter(cmd => {
          const normalized = cmd.name.startsWith('/') ? cmd.name : `/${cmd.name}`;
          if (localLabels.has(normalized) || seen.has(normalized)) return false;
          seen.add(normalized);
          return true;
        })
        .map((cmd, i) => {
          const normalized = cmd.name.startsWith('/') ? cmd.name : `/${cmd.name}`;
          // "/model" can't run in stream-json mode, so intercept it and drive
          // our own model switch instead of passing it to the CLI.
          return normalized === '/model'
            ? new ModelSlashCommand(cmd, 100 + i)
            : new CliPassthroughCommand(cmd, 100 + i);
        });
      const sortedCommands = [...localCommands, ...dynamicCommands]
        .sort((a, b) => a.label.localeCompare(b.label));
      sortedCommands.forEach((cmd, i) => { (cmd as { order: number }).order = i; });
      registry.registerSection(new SlashCommandsSection(), sortedCommands);
    }
    const built = registry.buildSections();
    return built.map((s) => applyModelCapabilityFlags(s, { supportsEffort, supportsFastMode }));
  }, [registry, commands, supportsEffort, supportsFastMode]);

  const contextValue = useMemo<CommandPaletteRegistryContextValue>(
    () => ({ registry, keyboardRegistry, sections }),
    [registry, keyboardRegistry, sections],
  );

  return (
    <CommandPaletteRegistryContext.Provider value={contextValue}>
      {confirmDialog}
      {children}
    </CommandPaletteRegistryContext.Provider>
  );
}
