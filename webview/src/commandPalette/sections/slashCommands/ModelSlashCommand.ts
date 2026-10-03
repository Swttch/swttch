import { SlashCommand } from '../../types';
import type { SlashCommandInfo } from '@/types/slashCommand';
import { SWITCH_MODEL_EVENT } from '@/pages/ChatPage/ModelSwitchOverlay';
import { restoreCommandName } from '../../hangulKeys';

/**
 * The CLI advertises `/model` in its command list but rejects it in stream-json
 * mode ("/model isn't available in this environment"), so passing it through
 * like a normal command (CliPassthroughCommand) never switches the model.
 * Instead we intercept it and drive our own model switch — the same set_model
 * path the "Switch model" overlay uses — which honours CLI equivalence ("what
 * the user does with /model in the CLI works in the GUI").
 *
 * - "/model"        → opens the model picker overlay.
 * - "/model sonnet" → opens the overlay carrying "sonnet" as a query so it
 *                     resolves the model and switches immediately.
 */
export class ModelSlashCommand extends SlashCommand {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly order: number;
  readonly commandInfo: SlashCommandInfo;

  constructor(commandInfo: SlashCommandInfo, order: number = 100) {
    super();
    const name = commandInfo.name;
    const normalized = name.startsWith('/') ? name : `/${name}`;
    this.id = `cli-${normalized.slice(1)}`;
    this.label = normalized;
    this.description = commandInfo.description || normalized;
    this.order = order;
    this.commandInfo = commandInfo;
  }

  async execute(): Promise<void> {
    const { chatStream } = this.getServices();
    const input = restoreCommandName(chatStream.input.trim(), this.label);
    // "/model sonnet" -> "sonnet"; "/model" (or palette click) -> undefined
    const arg = input.startsWith(this.label)
      ? input.slice(this.label.length).trim()
      : '';
    window.dispatchEvent(
      new CustomEvent(SWITCH_MODEL_EVENT, { detail: { query: arg || undefined } }),
    );
  }
}
