import { SlashCommand } from '../../types';
import { CONTROL_REQUEST_COMMANDS, type ControlRequestCommand } from '@/shared';

/**
 * Palette entries for the slash commands the CLI hides from us.
 *
 * A stream-json session is non-interactive as far as the CLI is concerned, so
 * commands flagged `supportsNonInteractive: false` are left out of the command
 * list it sends on `initialize`. `/reload-plugins` was reported missing for
 * exactly that reason (#270) — nothing on our side filtered it out, it simply
 * never arrived. `/btw` is absent for the same reason.
 *
 * Listing them here puts them back in the palette. Selecting one submits the
 * command text, which `handleSubmit` recognises and runs over the CLI's
 * `control_request` instead of sending it as a prompt.
 *
 * Registered in `localCommands`, so these shadow any same-named CLI entry via
 * the dedup filter in CommandPaletteProvider — should a future CLI start
 * offering them to us directly, the palette shows one entry, not two.
 */
export class ControlRequestSlashCommand extends SlashCommand {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly commandInfo: ControlRequestCommand;

  constructor(command: ControlRequestCommand) {
    super();
    this.id = `ccg-${command.name}`;
    this.label = `/${command.name}`;
    this.description = command.description;
    this.commandInfo = command;
  }

  async execute(): Promise<void> {
    const { chatStream, session } = this.getServices();
    const currentInput = chatStream.input.trim();
    // Keep the user's arguments when they typed the command out (`/btw why?`);
    // fall back to the bare command when it was picked from the palette.
    const message = currentInput.startsWith(this.label) ? currentInput : this.label;
    chatStream.runControlRequestCommand(message, session.inputMode);
    chatStream.setInput('');
  }
}

/** Palette entries for every command we dispatch via control_request. */
export function buildControlRequestCommands(): ControlRequestSlashCommand[] {
  return CONTROL_REQUEST_COMMANDS.map((command) => new ControlRequestSlashCommand(command));
}
