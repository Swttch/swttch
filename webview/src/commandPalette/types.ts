import React from 'react';
import {
  PanelItemType,
  IconType,
} from '@/types/commandPalette';
import { SessionState, Context } from '@/types';
import { InputMode } from '@/types/chatInput';
import type { ConfirmOptions } from '@/components/ConfirmDialog/useConfirmDialog';

/**
 * Services injected by CommandPaletteRegistry into commands.
 * Commands access current React state via getServices().
 */
export interface CommandPaletteServices {
  chatStream: {
    messages: any[];
    isStreaming: boolean;
    input: string;
    setInput: (input: string) => void;
    sendMessage: (content: string, inputMode: InputMode, context?: Context[]) => void;
    /** Run a slash command the CLI only accepts as a control_request (#270). */
    runControlRequestCommand: (command: string, inputMode: InputMode) => void;
    stop: () => void;
    continue: () => void;
    clearMessages: () => void;
    resetStreamState: () => void;
    resetForSessionSwitch: () => void;
  };
  session: {
    currentSessionId: string | null;
    sessionState: SessionState;
    workingDirectory: string | null;
    inputMode: InputMode;
    setSessionState: (state: SessionState) => void;
    resetToNewSession: () => void;
  };
  adapter: {
    openNewTab: () => Promise<void>;
    openSettings: () => Promise<void>;
    openTerminal: (workingDir: string) => Promise<void>;
  };
  ui: {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
  };
  workflowState: {
    /** Open the Background tasks panel; optional toolUseId to focus a workflow. */
    openPanel: (toolUseId?: string) => void;
  };
}

/**
 * Base interface for all command palette items.
 * NOTE: No `section` field - section membership is determined by registerSection().
 */
export interface CommandPaletteCommand {
  readonly id: string;
  readonly label: string;
  readonly type: PanelItemType;
  readonly icon?: IconType;
  readonly valueComponent?: () => React.ReactNode;
  /** Rendered right after the label (secondary color), e.g. Effort's "(Extra high)". */
  readonly labelSuffix?: () => React.ReactNode;
  readonly disabled: boolean;
  readonly keepOpen?: boolean;
  readonly order?: number;
  /** Hidden from the panel by default; only surfaced when the filter query matches its label. */
  readonly searchOnly?: boolean;
  /** Extra search terms; the item also matches the filter query when one of these contains it. */
  readonly keywords?: string[];

  execute(): Promise<void>;
  bindKeyboard?(e: KeyboardEvent): boolean;
}

/**
 * Abstract base class for slash commands (/clear, /init, /review, etc.)
 * NOTE: No `section` field.
 */
export abstract class SlashCommand implements CommandPaletteCommand {
  readonly type = PanelItemType.Command;
  readonly icon = IconType.Command;
  readonly disabled = false;
  readonly order?: number;

  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly description: string;

  /** Service accessor - injected by CommandPaletteRegistry */
  protected getServices!: () => CommandPaletteServices;

  /** @internal Called by CommandPaletteRegistry to inject service accessor */
  _bind(getServices: () => CommandPaletteServices): void {
    this.getServices = getServices;
  }

  abstract execute(): Promise<void>;
}

/**
 * A static toggle panel item.
 * Used for toggle items in sections like Model.
 */
export class StaticToggleItem implements CommandPaletteCommand {
  readonly type = PanelItemType.Toggle;
  readonly disabled: boolean;
  readonly order?: number;
  readonly icon?: IconType;
  readonly valueComponent?: () => React.ReactNode;
  toggled: boolean;
  onToggle: (value: boolean) => void;

  constructor(
    readonly id: string,
    readonly label: string,
    options: {
      toggled: boolean;
      onToggle: (value: boolean) => void;
      icon?: IconType;
      valueComponent?: () => React.ReactNode;
      disabled?: boolean;
      order?: number;
    },
  ) {
    this.toggled = options.toggled;
    this.onToggle = options.onToggle;
    this.icon = options.icon;
    this.valueComponent = options.valueComponent;
    this.disabled = options.disabled ?? false;
    this.order = options.order;
  }

  /** @internal Called by CommandPaletteRegistry to inject service accessor */
  _bind(_getServices: () => CommandPaletteServices): void {
    // Toggle items don't need services
  }

  async execute(): Promise<void> {
    this.onToggle(!this.toggled);
  }
}

/**
 * A static panel item that may or may not be active.
 * Used for non-slash-command items in sections like Context, Model, Customize, Settings, Support.
 * NOTE: No `section` constructor parameter - section is determined by registerSection().
 */
export class StaticItem implements CommandPaletteCommand {
  readonly type = PanelItemType.Action;
  readonly disabled: boolean;
  readonly keepOpen?: boolean;
  readonly order?: number;
  readonly searchOnly?: boolean;
  readonly keywords?: string[];

  private action?: () => Promise<void>;
  private serviceAction?: (services: CommandPaletteServices) => Promise<void>;
  private getServices?: () => CommandPaletteServices;

  constructor(
    readonly id: string,
    readonly label: string,
    options?: {
      icon?: IconType;
      valueComponent?: () => React.ReactNode;
      labelSuffix?: () => React.ReactNode;
      disabled?: boolean;
      keepOpen?: boolean;
      order?: number;
      searchOnly?: boolean;
      keywords?: string[];
      action?: () => Promise<void>;
      serviceAction?: (services: CommandPaletteServices) => Promise<void>;
    },
  ) {
    this.icon = options?.icon;
    this.valueComponent = options?.valueComponent;
    this.labelSuffix = options?.labelSuffix;
    this.disabled = options?.disabled ?? true;
    this.keepOpen = options?.keepOpen;
    this.order = options?.order;
    this.searchOnly = options?.searchOnly;
    this.keywords = options?.keywords;
    this.action = options?.action;
    this.serviceAction = options?.serviceAction;
  }

  readonly icon?: IconType;
  readonly valueComponent?: () => React.ReactNode;
  readonly labelSuffix?: () => React.ReactNode;

  /** @internal Called by CommandPaletteRegistry to inject service accessor */
  _bind(getServices: () => CommandPaletteServices): void {
    this.getServices = getServices;
  }

  async execute(): Promise<void> {
    if (this.serviceAction && this.getServices) {
      await this.serviceAction(this.getServices());
    } else if (this.action) {
      await this.action();
    }
  }
}
