import { SlashCommand } from '../../types';
import type { SlashCommandInfo } from '@/types/slashCommand';
import { restoreCommandName } from '../../hangulKeys';

export class CliPassthroughCommand extends SlashCommand {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly order: number;
  readonly commandInfo: SlashCommandInfo;

  constructor(commandInfo: SlashCommandInfo, order: number = 100) {
    super();
    const name = commandInfo.name;
    // const sanitized = commandInfo.name.replace(/[\x00-\x1f\x7f]/g, '');
    const normalized = name.startsWith('/') ? name : `/${name}`;
    this.id = `cli-${normalized.slice(1)}`;
    this.label = normalized;
    this.description = commandInfo.description || normalized;
    this.order = order;
    this.commandInfo = commandInfo;
  }

  async execute(): Promise<void> {
    const { chatStream, session } = this.getServices();
    const currentInput = restoreCommandName(chatStream.input.trim(), this.label);
    // Send full input (with args) when the user typed this command directly,
    // otherwise send just the command name (e.g. clicked from palette).
    const message = currentInput.startsWith(this.label) ? currentInput : this.label;
    chatStream.sendMessage(message, session.inputMode);
  }
}
