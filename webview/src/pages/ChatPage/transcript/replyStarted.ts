import type { LoadedMessageDto } from '../../../types';
import { LoadedMessageType } from '@/dto';
import { isRepliedInChat } from '../AskUserQuestionInputPanel/repliedInChat';

/** The text of a tool result, which the CLI hands over as a string or as text blocks. */
function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => ((block as { type?: string; text?: string }).type === 'text' ? ((block as { text?: string }).text ?? '') : '')).join('');
}

/** Whether the entry holds a result of the question tool that the person replied to in the chat. */
function isRepliedQuestionResult(message: LoadedMessageDto): boolean {
  const content = message.message?.content;
  return (
    message.type === LoadedMessageType.User &&
    Array.isArray(content) &&
    content.some((block) => (block as { type?: string }).type === 'tool_result' && isRepliedInChat(toolResultText((block as { content?: unknown }).content)))
  );
}

/** Whether the entry is a message the person typed: a user entry of plain text, which is no result of any tool. */
function isTypedMessage(message: LoadedMessageDto): boolean {
  if (message.type !== LoadedMessageType.User) return false;
  const content = message.message?.content;
  if (typeof content === 'string') return true;
  return Array.isArray(content) && content.length > 0 && content.every((block) => (block as { type?: string }).type === 'text');
}

/**
 * Whether the working line already carries the time the turn has taken ("22s · 45 tokens") and not only the tokens.
 *
 * That is so once the model has begun writing its answer under the line: the newest entry is its text.
 *
 * It is also so, for the rest of the turn, once a question was answered by a message typed in the chat: the desktop
 * app's line carries the time from the moment of the answer, before the model has written anything (measured on its
 * recording). That turn is the one the question was asked in, and it goes on from the result of the question tool:
 * the message that replaced the question stands right after the result (the CLI has just read it there, and the chat
 * puts it in then), so that message is no new turn. A message the person types after the model has answered it is.
 */
export function replyStartedIn(messages: ReadonlyArray<LoadedMessageDto>): boolean {
  const last = messages[messages.length - 1];
  const lastContent = last?.message?.content;
  if (
    last?.type === LoadedMessageType.Assistant &&
    Array.isArray(lastContent) &&
    lastContent.some((block) => (block as { type?: string; text?: string }).type === 'text' && Boolean((block as { text?: string }).text?.trim()))
  ) {
    return true;
  }

  // The turn that is running began at the last message the person typed that no question result stands before.
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (isRepliedQuestionResult(messages[i])) return true;
    if (isTypedMessage(messages[i])) {
      let j = i - 1;
      while (j >= 0 && isTypedMessage(messages[j])) j -= 1;
      // The message is the one that replaced the question when the question's result stands before it.
      if (j >= 0 && isRepliedQuestionResult(messages[j])) return true;
      return false;
    }
  }
  return false;
}
