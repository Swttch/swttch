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
 * `<command-name>` and `<command-message>`, which for a command without
 * arguments leaves the empty string. That empty string is what the old hover
 * copy button put on the clipboard for a bubble that plainly reads `/clear`
 * (issue #412).
 *
 * The `args` half is what the user typed after the name (`/rename My name`).
 * The bubble draws it the same way, and these must not disagree about what the
 * send says.
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
  return composeSendText(getTextContent(message));
}

/**
 * The same, from the text alone, so the index's cut copy of a send that is not
 * loaded reads exactly as the loaded one will once it arrives.
 *
 * A message that opens with reply or excerpt cards has the cards ahead of what
 * was typed, and `parseUserContent` takes them out of `text`. Reading `text`
 * alone left a send made of replies empty: its card was blank, and a send whose
 * tick showed the raw `<!-- reply -->` markers before it was loaded went blank
 * after a jump loaded it (#657). The cards are put back as the lines the bubble
 * draws: each quote, then its comment, then what was typed.
 */
export function composeSendText(raw: string): string {
  const parsed = parseUserContent(raw);
  if (parsed.commandName !== undefined) return commandSendText(parsed.commandName, parsed.text);
  const lines = [
    ...parsed.replies.flatMap(reply => [reply.quote, reply.comment]),
    ...parsed.excerpts,
    parsed.text,
  ];
  return lines.map(line => line.trim()).filter(Boolean).join('\n');
}
