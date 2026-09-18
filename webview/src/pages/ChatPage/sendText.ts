import { getTextContent, type LoadedMessageDto } from '@/types';
import { parseUserContent } from './message-renderers/utils/parseUserContent';

/**
 * What a slash-command send reads as, as one plain string.
 *
 * The bubble cannot draw it as one: it dims the leading `/` and the arguments
 * in spans of their own. So the rule for assembling the two parts lives here
 * and every other surface is built from it. A copy, or a preview, has to
 * produce what the user is looking at, and for a slash command
 * `parsedContent.text` alone is not that: `parseUserContent` strips
 * `<command-name>`, `<command-message>` and `<command-args>`, which for every
 * such entry the CLI writes leaves the empty string. That empty string is what
 * the old hover copy button put on the clipboard for a bubble that plainly
 * reads `/clear` (issue #412).
 *
 * The `args` half is therefore near-theoretical: measured across all 45
 * slash-command entries in the local session files, none carries text outside
 * those three tags. It is kept because the bubble has the same branch, and
 * these must not disagree about what the send says.
 */
export function commandSendText(commandName: string | undefined, args: string): string {
  const command = `/${commandName ?? ''}`;
  return args ? `${command} ${args}` : command;
}

/**
 * The text of one send, as the transcript shows it.
 *
 * Lives here rather than inside any one surface because three of them now ask
 * the same question: the bubble draws it, the copy action puts it on the
 * clipboard, and the send index previews it. Three separate answers would let
 * an entry read one way in the transcript and another way in the index, and the
 * index would look wrong for a send that is perfectly fine.
 */
export function sendText(message: LoadedMessageDto): string {
  const parsed = parseUserContent(getTextContent(message));
  return parsed.commandName !== undefined
    ? commandSendText(parsed.commandName, parsed.text)
    : parsed.text;
}
